import type { Accrual, Invoice } from "../api";
import {
  buildInvoiceDetailFields,
  canAddInvoiceLineFromDetails,
  canCreateAccrualFromInvoiceDetails,
  canEditInvoiceDueDateFromDetails,
  canEditInvoiceHeaderFromDetails,
  canIssueInvoiceFromDetails,
  canRemoveInvoiceLineFromDetails,
  canUpdateInvoiceLineFromDetails,
  detailLifecycleActionsFor
} from "../invoiceDetail";
import {
  buildRelatedAccrualRowView,
  type RelatedAccrualRowView
} from "../invoiceAccrualBridge";
import { formatDate, formatMoney } from "../format";
import { StatusMessage } from "./Panel";

type InvoiceDetailCollectionsContext = {
  daysOverdue: number | null;
  bucketLabel: string;
  bucketId: string | null;
  amountDisplay: string;
  counterpartyReference: string;
  status: string;
  dueDateDisplay: string;
  positionLabel: string | null;
  canGoNext: boolean;
  isLast: boolean;
  onNext: () => void;
};

type InvoiceDetailPanelProps = {
  invoice: Invoice | null;
  loading: boolean;
  error: string | null;
  errorRetryable: boolean;
  closeDisabled?: boolean;
  headerEditBusy?: boolean;
  headerEditOpen?: boolean;
  lineAddBusy?: boolean;
  lineAddOpen?: boolean;
  lineUpdateBusy?: boolean;
  lineUpdateOpen?: boolean;
  lineRemoveBusy?: boolean;
  lineRemoveOpen?: boolean;
  dueDateEditBusy?: boolean;
  dueDateEditOpen?: boolean;
  issueBusy?: boolean;
  issueOpen?: boolean;
  createAccrualBusy?: boolean;
  createAccrualOpen?: boolean;
  relatedAccruals?: Accrual[];
  relatedAccrualsLoading?: boolean;
  relatedAccrualsError?: string | null;
  collectionsContext?: InvoiceDetailCollectionsContext | null;
  onClose: () => void;
  onRetry: () => void;
  onRetryRelatedAccruals?: () => void;
  onEditHeader?: (invoice: Invoice) => void;
  onAddLine?: (invoice: Invoice) => void;
  onUpdateLine?: (invoice: Invoice, lineId: string) => void;
  onRemoveLine?: (invoice: Invoice, lineId: string) => void;
  onEditDueDate?: (invoice: Invoice) => void;
  onIssue?: (invoice: Invoice) => void;
  onCreateAccrual?: (invoice: Invoice) => void;
  onOpenAccrual?: (accrualId: string) => void;
};

export function InvoiceDetailPanel({
  invoice,
  loading,
  error,
  errorRetryable,
  closeDisabled = false,
  headerEditBusy = false,
  headerEditOpen = false,
  lineAddBusy = false,
  lineAddOpen = false,
  lineUpdateBusy = false,
  lineUpdateOpen = false,
  lineRemoveBusy = false,
  lineRemoveOpen = false,
  dueDateEditBusy = false,
  dueDateEditOpen = false,
  issueBusy = false,
  issueOpen = false,
  createAccrualBusy = false,
  createAccrualOpen = false,
  relatedAccruals = [],
  relatedAccrualsLoading = false,
  relatedAccrualsError = null,
  collectionsContext = null,
  onClose,
  onRetry,
  onRetryRelatedAccruals,
  onEditHeader,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onEditDueDate,
  onIssue,
  onCreateAccrual,
  onOpenAccrual
}: InvoiceDetailPanelProps) {
  const fields = invoice ? buildInvoiceDetailFields(invoice) : null;
  const lifecycleActions = invoice ? detailLifecycleActionsFor(invoice) : [];
  const showEditHeader =
    invoice !== null &&
    canEditInvoiceHeaderFromDetails(invoice) &&
    lifecycleActions.includes("editHeader") &&
    Boolean(onEditHeader);
  const showAddLine =
    invoice !== null &&
    canAddInvoiceLineFromDetails(invoice) &&
    lifecycleActions.includes("addLine") &&
    Boolean(onAddLine);
  const showEditDueDate =
    invoice !== null &&
    canEditInvoiceDueDateFromDetails(invoice) &&
    lifecycleActions.includes("editDueDate") &&
    Boolean(onEditDueDate);
  const showIssue =
    invoice !== null &&
    canIssueInvoiceFromDetails(invoice) &&
    lifecycleActions.includes("issue") &&
    Boolean(onIssue);
  const showCreateAccrual =
    invoice !== null &&
    canCreateAccrualFromInvoiceDetails(invoice) &&
    lifecycleActions.includes("createAccrual") &&
    Boolean(onCreateAccrual);
  const showLineManage =
    invoice !== null &&
    canUpdateInvoiceLineFromDetails(invoice) &&
    canRemoveInvoiceLineFromDetails(invoice) &&
    Boolean(onUpdateLine) &&
    Boolean(onRemoveLine);
  const showActions =
    showEditHeader || showAddLine || showEditDueDate || showIssue || showCreateAccrual;
  const actionsDisabled =
    closeDisabled ||
    headerEditBusy ||
    headerEditOpen ||
    lineAddBusy ||
    lineAddOpen ||
    lineUpdateBusy ||
    lineUpdateOpen ||
    lineRemoveBusy ||
    lineRemoveOpen ||
    dueDateEditBusy ||
    dueDateEditOpen ||
    issueBusy ||
    issueOpen ||
    createAccrualBusy ||
    createAccrualOpen;

  const relatedRows: RelatedAccrualRowView[] = relatedAccruals.map((accrual) =>
    buildRelatedAccrualRowView(accrual, formatMoney, formatDate)
  );

  return (
    <section
      className="issue-prepare-form invoice-detail-panel"
      aria-labelledby="invoice-detail-heading"
    >
      <div className="panel-header">
        <h3 id="invoice-detail-heading">Деталі рахунку</h3>
        <button
          type="button"
          className="button-secondary"
          onClick={onClose}
          disabled={closeDisabled}
        >
          Закрити
        </button>
      </div>

      {loading ? <StatusMessage>Завантаження деталей…</StatusMessage> : null}

      {!loading && error ? (
        <div className="state-actions" role="alert">
          <StatusMessage tone="error">{error}</StatusMessage>
          {errorRetryable ? (
            <button type="button" onClick={onRetry}>
              Спробувати знову
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && fields && invoice ? (
        <>
          <p className="meta cell-wrap">{fields.documentNumber}</p>
          <dl className="facts">
            <div>
              <dt>Статус</dt>
              <dd>{fields.status}</dd>
            </div>
            <div>
              <dt>Контрагент</dt>
              <dd className="cell-wrap">{fields.counterpartyReference}</dd>
            </div>
            <div>
              <dt>Сума</dt>
              <dd>{fields.amountDisplay}</dd>
            </div>
            <div>
              <dt>Валюта</dt>
              <dd>{fields.currency}</dd>
            </div>
            <div>
              <dt>Строк оплати</dt>
              <dd>{fields.dueDateDisplay}</dd>
            </div>
            <div>
              <dt>Виставлено</dt>
              <dd>{fields.issuedAtDisplay}</dd>
            </div>
            <div>
              <dt>Створено</dt>
              <dd>{fields.createdAtDisplay}</dd>
            </div>
            <div>
              <dt>Оновлено</dt>
              <dd>{fields.updatedAtDisplay}</dd>
            </div>
            <div>
              <dt>Id</dt>
              <dd className="mono">{fields.invoiceId}</dd>
            </div>
          </dl>

          <section
            className="due-date-aging-block"
            aria-labelledby="invoice-due-aging-heading"
          >
            <h4 id="invoice-due-aging-heading">Строк оплати (календар)</h4>
            <dl className="facts">
              <div>
                <dt>Строк оплати</dt>
                <dd>{fields.dueDateDisplay}</dd>
              </div>
              <div>
                <dt>Статус строку</dt>
                <dd>
                  <span
                    className={`aging-badge aging-badge--${fields.dueDateAging.kind}`}
                  >
                    {fields.dueDateAging.label}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Дні відносно строку</dt>
                <dd>{fields.dueDateAging.dayOffsetLabel}</dd>
              </div>
            </dl>
            <p className="meta due-date-aging-note">{fields.dueDateAging.explanation}</p>
          </section>

          {collectionsContext ? (
            <section
              className="collections-context-block"
              aria-labelledby="invoice-collections-heading"
            >
              <h4 id="invoice-collections-heading">Payment collection</h4>
              <dl className="facts">
                <div>
                  <dt>Дні прострочення</dt>
                  <dd>
                    {collectionsContext.daysOverdue == null
                      ? "Строк сьогодні / —"
                      : collectionsContext.daysOverdue}
                  </dd>
                </div>
                <div>
                  <dt>Aging bucket</dt>
                  <dd>
                    {collectionsContext.bucketId ? (
                      <span
                        className={`aging-badge aging-badge--bucket aging-badge--bucket-${collectionsContext.bucketId.replace("+", "plus")}`}
                      >
                        {collectionsContext.bucketLabel}
                      </span>
                    ) : (
                      collectionsContext.bucketLabel
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Строк оплати</dt>
                  <dd>{collectionsContext.dueDateDisplay}</dd>
                </div>
                <div>
                  <dt>Сума рахунка</dt>
                  <dd>{collectionsContext.amountDisplay}</dd>
                </div>
                <div>
                  <dt>Контрагент</dt>
                  <dd className="cell-wrap">{collectionsContext.counterpartyReference}</dd>
                </div>
                <div>
                  <dt>Статус invoice</dt>
                  <dd>{collectionsContext.status}</dd>
                </div>
                <div>
                  <dt>Позиція в queue</dt>
                  <dd>{collectionsContext.positionLabel ?? "—"}</dd>
                </div>
              </dl>
              <div className="filter-actions">
                <button
                  type="button"
                  disabled={!collectionsContext.canGoNext || closeDisabled}
                  title={
                    collectionsContext.isLast
                      ? "Це останній рахунок у поточній collections queue"
                      : "Наступний прострочений рахунок у поточному bucket"
                  }
                  onClick={collectionsContext.onNext}
                >
                  Next collection invoice
                </button>
                {collectionsContext.isLast ? (
                  <p className="meta">Останній рахунок у поточній collections queue.</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {fields.lines.length > 0 ? (
            <div className="table-wrap">
              <p className="meta">Рядки</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Опис</th>
                    <th>Кількість</th>
                    <th>Ціна</th>
                    <th>Сума</th>
                    {showLineManage ? <th>Дія</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {fields.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.sequence}</td>
                      <td className="cell-wrap">{line.descriptionDisplay}</td>
                      <td>{line.quantityDisplay}</td>
                      <td>{line.unitPriceDisplay}</td>
                      <td>{line.lineAmountDisplay}</td>
                      {showLineManage ? (
                        <td>
                          <div className="filter-actions">
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={actionsDisabled}
                              onClick={() => onUpdateLine?.(invoice, line.id)}
                            >
                              {lineUpdateBusy ? "Збереження…" : "Змінити"}
                            </button>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={actionsDisabled}
                              onClick={() => onRemoveLine?.(invoice, line.id)}
                            >
                              {lineRemoveBusy ? "Видалення…" : "Видалити"}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="meta">Рядків немає.</p>
          )}

          <div className="table-wrap" aria-labelledby="invoice-related-accruals-heading">
            <p className="meta" id="invoice-related-accruals-heading">
              Повʼязані нарахування
            </p>
            {relatedAccrualsLoading ? (
              <StatusMessage>Завантаження нарахувань…</StatusMessage>
            ) : null}
            {!relatedAccrualsLoading && relatedAccrualsError ? (
              <div className="state-actions" role="alert">
                <StatusMessage tone="error">{relatedAccrualsError}</StatusMessage>
                {onRetryRelatedAccruals ? (
                  <button type="button" onClick={onRetryRelatedAccruals}>
                    Спробувати знову
                  </button>
                ) : null}
              </div>
            ) : null}
            {!relatedAccrualsLoading && !relatedAccrualsError && relatedRows.length === 0 ? (
              <p className="meta">Повʼязаних нарахувань немає.</p>
            ) : null}
            {!relatedAccrualsLoading && !relatedAccrualsError && relatedRows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Опис</th>
                    <th>Статус</th>
                    <th>Сума</th>
                    <th>Дата визнання</th>
                    {onOpenAccrual ? <th>Дія</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {relatedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="cell-wrap">{row.description}</td>
                      <td>{row.status}</td>
                      <td>{row.amountDisplay}</td>
                      <td>{row.recognitionDateDisplay}</td>
                      {onOpenAccrual ? (
                        <td>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={actionsDisabled}
                            onClick={() => onOpenAccrual(row.id)}
                          >
                            Відкрити
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          {showActions ? (
            <div className="filter-actions invoice-detail-actions">
              <p className="meta">Дії</p>
              {showEditHeader ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onEditHeader?.(invoice)}
                >
                  {headerEditBusy ? "Збереження…" : "Змінити реквізити"}
                </button>
              ) : null}
              {showAddLine ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onAddLine?.(invoice)}
                >
                  {lineAddBusy ? "Збереження…" : "Додати рядок"}
                </button>
              ) : null}
              {showEditDueDate ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onEditDueDate?.(invoice)}
                >
                  {dueDateEditBusy ? "Збереження…" : "Змінити дату оплати"}
                </button>
              ) : null}
              {showIssue ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onIssue?.(invoice)}
                >
                  {issueBusy ? "Виставлення…" : "Виставити"}
                </button>
              ) : null}
              {showCreateAccrual ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onCreateAccrual?.(invoice)}
                >
                  {createAccrualBusy ? "Створення…" : "Створити нарахування"}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
