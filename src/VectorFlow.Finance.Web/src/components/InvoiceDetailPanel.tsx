import type { Accrual, Invoice } from "../api";
import type { FormEvent } from "react";
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
import type {
  CollectionResolutionKind,
  DisputeStatus,
  PromiseFollowUpStatus,
  PromiseToPayRecord
} from "../promiseToPay";
import {
  RESOLUTION_KIND_OPTIONS,
  disputeStatusLabel,
  isActiveDispute,
  promiseStatusLabel,
  resolutionKindLabel
} from "../promiseToPay";
import {
  ACTIVITY_EVENT_TYPE_OPTIONS,
  CONTACT_CHANNEL_OPTIONS,
  CONTACT_RESULT_OPTIONS,
  DISPUTE_PARTY_OPTIONS,
  DISPUTE_REASON_OPTIONS,
  activityEventTypeLabel,
  contactChannelLabel,
  contactResultLabel,
  disputePartyLabel,
  disputeReasonLabel,
  type CaseHistoryView,
  type CollectionActivityEventTypeFilter,
  type ContactChannel,
  type ContactResult,
  type DisputeParty,
  type DisputeReason
} from "../collectionCaseHistory";
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

type InvoiceDetailPromiseContext = {
  record: PromiseToPayRecord | null;
  formOpen: boolean;
  promiseDate: string;
  note: string;
  error: string | null;
  success: string | null;
  busy: boolean;
  resolutionOpen: boolean;
  resolutionKind: CollectionResolutionKind | "";
  resolutionPaymentDate: string;
  resolutionPaidAmount: string;
  resolutionRemainingAmount: string;
  resolutionPromiseDate: string;
  resolutionReason: string;
  resolutionNote: string;
  contactOpen: boolean;
  contactChannel: ContactChannel | "";
  contactResult: ContactResult | "";
  contactNote: string;
  contactFollowUpAt: string;
  disputeOpen: boolean;
  disputeEditMode: boolean;
  disputeCloseMode: "" | "resolve" | "reject";
  disputeReason: DisputeReason | "";
  disputeDescription: string;
  disputeParty: DisputeParty | "";
  disputeReviewAt: string;
  disputeCloseComment: string;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onPromiseDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSave: () => void;
  onMarkFollowUpRequired: () => void;
  onMarkContacted: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onOpenResolution: () => void;
  onCloseResolution: () => void;
  onResolutionKindChange: (value: CollectionResolutionKind | "") => void;
  onResolutionPaymentDateChange: (value: string) => void;
  onResolutionPaidAmountChange: (value: string) => void;
  onResolutionRemainingAmountChange: (value: string) => void;
  onResolutionPromiseDateChange: (value: string) => void;
  onResolutionReasonChange: (value: string) => void;
  onResolutionNoteChange: (value: string) => void;
  onSaveResolution: () => void;
  onOpenContact: () => void;
  onCloseContact: () => void;
  onContactChannelChange: (value: ContactChannel | "") => void;
  onContactResultChange: (value: ContactResult | "") => void;
  onContactNoteChange: (value: string) => void;
  onContactFollowUpAtChange: (value: string) => void;
  onSaveContact: () => void;
  onClearFollowUp: () => void;
  onOpenRaiseDispute: () => void;
  onOpenEditDispute: () => void;
  onOpenResolveDispute: () => void;
  onOpenRejectDispute: () => void;
  onCloseDisputeForm: () => void;
  onDisputeReasonChange: (value: DisputeReason | "") => void;
  onDisputeDescriptionChange: (value: string) => void;
  onDisputePartyChange: (value: DisputeParty | "") => void;
  onDisputeReviewAtChange: (value: string) => void;
  onDisputeCloseCommentChange: (value: string) => void;
  onSaveDispute: () => void;
  onConfirmCloseDispute: () => void;
};

type InvoiceDetailHistoryContext = {
  open: boolean;
  view: CaseHistoryView | null;
  typeFilter: CollectionActivityEventTypeFilter;
  searchDraft: string;
  onOpen: () => void;
  onClose: () => void;
  onTypeChange: (value: CollectionActivityEventTypeFilter) => void;
  onSearchDraftChange: (value: string) => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleExpanded: () => void;
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
  promiseContext?: InvoiceDetailPromiseContext | null;
  historyContext?: InvoiceDetailHistoryContext | null;
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
  promiseContext = null,
  historyContext = null,
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
    createAccrualOpen ||
    Boolean(promiseContext?.busy) ||
    Boolean(promiseContext?.formOpen) ||
    Boolean(promiseContext?.resolutionOpen) ||
    Boolean(promiseContext?.contactOpen) ||
    Boolean(promiseContext?.disputeOpen);

  const relatedRows: RelatedAccrualRowView[] = relatedAccruals.map((accrual) =>
    buildRelatedAccrualRowView(accrual, formatMoney, formatDate)
  );

  const promiseStatus = promiseContext?.record?.status as PromiseFollowUpStatus | undefined;

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

          {promiseContext ? (
            <section
              className="promise-followup-block"
              aria-labelledby="invoice-promise-heading"
            >
              <h4 id="invoice-promise-heading">Promise to pay</h4>
              {promiseContext.record ? (
                <dl className="facts">
                  <div>
                    <dt>Promise date</dt>
                    <dd>{promiseContext.record.promiseDate}</dd>
                  </div>
                  <div>
                    <dt>Follow-up status</dt>
                    <dd>
                      <span
                        className={`aging-badge aging-badge--promise aging-badge--promise-${promiseContext.record.status}`}
                      >
                        {promiseStatusLabel(promiseContext.record.status)}
                      </span>
                    </dd>
                  </div>
                  {promiseContext.record.resolution ? (
                    <div>
                      <dt>Resolution</dt>
                      <dd>
                        <span
                          className={`aging-badge aging-badge--promise aging-badge--resolution-${promiseContext.record.resolution.kind}`}
                        >
                          {resolutionKindLabel(promiseContext.record.resolution.kind)}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.paymentDate ? (
                    <div>
                      <dt>Payment date</dt>
                      <dd>{promiseContext.record.resolution.paymentDate}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.paidAmount != null ? (
                    <div>
                      <dt>Paid amount</dt>
                      <dd>{promiseContext.record.resolution.paidAmount.toFixed(2)}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.remainingAmount != null ? (
                    <div>
                      <dt>Remaining amount</dt>
                      <dd>{promiseContext.record.resolution.remainingAmount.toFixed(2)}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.reason ? (
                    <div>
                      <dt>Reason</dt>
                      <dd className="cell-wrap">{promiseContext.record.resolution.reason}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.note ? (
                    <div>
                      <dt>Note</dt>
                      <dd className="cell-wrap">{promiseContext.record.note}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.nextFollowUpAt ? (
                    <div>
                      <dt>Next follow-up</dt>
                      <dd>{promiseContext.record.nextFollowUpAt}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.lastContact ? (
                    <>
                      <div>
                        <dt>Last contact</dt>
                        <dd>
                          {contactChannelLabel(promiseContext.record.lastContact.channel)}
                          {" · "}
                          {contactResultLabel(promiseContext.record.lastContact.result)}
                        </dd>
                      </div>
                      {promiseContext.record.lastContact.note ? (
                        <div>
                          <dt>Contact note</dt>
                          <dd className="cell-wrap">
                            {promiseContext.record.lastContact.note}
                          </dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {promiseContext.record.dispute ? (
                    <>
                      <div>
                        <dt>Dispute</dt>
                        <dd>
                          <span
                            className={`aging-badge aging-badge--promise aging-badge--dispute-${promiseContext.record.dispute.status as DisputeStatus}`}
                          >
                            {disputeStatusLabel(promiseContext.record.dispute.status)}
                          </span>
                          {" · "}
                          {disputeReasonLabel(promiseContext.record.dispute.reason)}
                        </dd>
                      </div>
                      <div>
                        <dt>Dispute owner</dt>
                        <dd>
                          {disputePartyLabel(promiseContext.record.dispute.responsibleParty)}
                        </dd>
                      </div>
                      <div>
                        <dt>Dispute description</dt>
                        <dd className="cell-wrap">
                          {promiseContext.record.dispute.description}
                        </dd>
                      </div>
                      {promiseContext.record.dispute.nextReviewAt ? (
                        <div>
                          <dt>Dispute review</dt>
                          <dd>{promiseContext.record.dispute.nextReviewAt}</dd>
                        </div>
                      ) : null}
                      {promiseContext.record.dispute.resolutionComment ? (
                        <div>
                          <dt>Dispute outcome</dt>
                          <dd className="cell-wrap">
                            {promiseContext.record.dispute.resolutionComment}
                          </dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className="meta">Обіцянку оплати ще не зафіксовано.</p>
              )}

              {promiseContext.success ? (
                <StatusMessage tone="success">{promiseContext.success}</StatusMessage>
              ) : null}
              {promiseContext.error ? (
                <StatusMessage tone="error">{promiseContext.error}</StatusMessage>
              ) : null}

              {promiseContext.formOpen ? (
                <form
                  className="filter-form promise-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSave();
                  }}
                >
                  <label>
                    Promise date
                    <input
                      type="date"
                      required
                      value={promiseContext.promiseDate}
                      onChange={(event) =>
                        promiseContext.onPromiseDateChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <label>
                    Note
                    <input
                      value={promiseContext.note}
                      onChange={(event) => promiseContext.onNoteChange(event.target.value)}
                      placeholder="коротка нотатка (необовʼязково)"
                      autoComplete="off"
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <div className="filter-actions">
                    <button type="submit" disabled={promiseContext.busy || closeDisabled}>
                      {promiseContext.busy
                        ? "Збереження…"
                        : promiseContext.record
                          ? "Оновити обіцянку"
                          : "Зберегти обіцянку"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.resolutionOpen && promiseContext.record ? (
                <form
                  className="filter-form resolution-form"
                  aria-labelledby="collection-resolution-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSaveResolution();
                  }}
                >
                  <h4 id="collection-resolution-heading">Resolution</h4>
                  <label>
                    Action
                    <select
                      value={promiseContext.resolutionKind}
                      onChange={(event) =>
                        promiseContext.onResolutionKindChange(
                          event.target.value as CollectionResolutionKind | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть результат…</option>
                      {RESOLUTION_KIND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {promiseContext.resolutionKind === "paid" ||
                  promiseContext.resolutionKind === "partially_paid" ? (
                    <label>
                      Payment date
                      <input
                        type="date"
                        required
                        value={promiseContext.resolutionPaymentDate}
                        onChange={(event) =>
                          promiseContext.onResolutionPaymentDateChange(event.target.value)
                        }
                        disabled={promiseContext.busy}
                      />
                    </label>
                  ) : null}
                  {promiseContext.resolutionKind === "partially_paid" ? (
                    <>
                      <label>
                        Paid amount
                        <input
                          inputMode="decimal"
                          required
                          value={promiseContext.resolutionPaidAmount}
                          onChange={(event) =>
                            promiseContext.onResolutionPaidAmountChange(event.target.value)
                          }
                          disabled={promiseContext.busy}
                          placeholder="0.00"
                        />
                      </label>
                      <label>
                        Remaining amount
                        <input
                          inputMode="decimal"
                          required
                          value={promiseContext.resolutionRemainingAmount}
                          onChange={(event) =>
                            promiseContext.onResolutionRemainingAmountChange(event.target.value)
                          }
                          disabled={promiseContext.busy}
                          placeholder="0.00"
                        />
                      </label>
                    </>
                  ) : null}
                  {promiseContext.resolutionKind === "new_promise" ? (
                    <label>
                      New promise date
                      <input
                        type="date"
                        required
                        value={promiseContext.resolutionPromiseDate}
                        onChange={(event) =>
                          promiseContext.onResolutionPromiseDateChange(event.target.value)
                        }
                        disabled={promiseContext.busy}
                      />
                    </label>
                  ) : null}
                  {promiseContext.resolutionKind === "disputed" ||
                  promiseContext.resolutionKind === "escalated" ? (
                    <label>
                      {promiseContext.resolutionKind === "disputed"
                        ? "Dispute reason"
                        : "Escalation reason"}
                      <input
                        required
                        value={promiseContext.resolutionReason}
                        onChange={(event) =>
                          promiseContext.onResolutionReasonChange(event.target.value)
                        }
                        disabled={promiseContext.busy}
                        autoComplete="off"
                      />
                    </label>
                  ) : null}
                  {promiseContext.resolutionKind ? (
                    <label>
                      Note
                      <input
                        value={promiseContext.resolutionNote}
                        onChange={(event) =>
                          promiseContext.onResolutionNoteChange(event.target.value)
                        }
                        placeholder="коротка нотатка (необовʼязково)"
                        autoComplete="off"
                        disabled={promiseContext.busy}
                      />
                    </label>
                  ) : null}
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.resolutionKind
                      }
                    >
                      {promiseContext.busy ? "Збереження…" : "Save resolution"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseResolution}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.contactOpen ? (
                <form
                  className="filter-form contact-form"
                  aria-labelledby="collection-contact-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSaveContact();
                  }}
                >
                  <h4 id="collection-contact-heading">Log contact</h4>
                  <label>
                    Channel
                    <select
                      value={promiseContext.contactChannel}
                      onChange={(event) =>
                        promiseContext.onContactChannelChange(
                          event.target.value as ContactChannel | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть канал…</option>
                      {CONTACT_CHANNEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Result
                    <select
                      value={promiseContext.contactResult}
                      onChange={(event) =>
                        promiseContext.onContactResultChange(
                          event.target.value as ContactResult | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть результат…</option>
                      {CONTACT_RESULT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {promiseContext.contactResult === "payment_promised" ? (
                    <p className="meta">
                      Результат «Payment promised» збереже контакт і відкриє форму Promise to
                      pay для фіксації дати обіцянки.
                    </p>
                  ) : null}
                  <label>
                    Note
                    <input
                      value={promiseContext.contactNote}
                      onChange={(event) =>
                        promiseContext.onContactNoteChange(event.target.value)
                      }
                      placeholder="коротка нотатка (необовʼязково)"
                      autoComplete="off"
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <label>
                    Next follow-up
                    <input
                      type="date"
                      value={promiseContext.contactFollowUpAt}
                      onChange={(event) =>
                        promiseContext.onContactFollowUpAtChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.contactChannel ||
                        !promiseContext.contactResult
                      }
                    >
                      {promiseContext.busy ? "Збереження…" : "Save contact"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseContact}
                    >
                      Скасувати
                    </button>
                    {promiseContext.record?.nextFollowUpAt ? (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onClearFollowUp}
                      >
                        Clear follow-up
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : null}

              {promiseContext.disputeOpen && !promiseContext.disputeCloseMode ? (
                <form
                  className="filter-form dispute-form"
                  aria-labelledby="collection-dispute-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSaveDispute();
                  }}
                >
                  <h4 id="collection-dispute-heading">
                    {promiseContext.disputeEditMode ? "Update dispute" : "Raise dispute"}
                  </h4>
                  <label>
                    Reason *
                    <select
                      value={promiseContext.disputeReason}
                      onChange={(event) =>
                        promiseContext.onDisputeReasonChange(
                          event.target.value as DisputeReason | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть причину…</option>
                      {DISPUTE_REASON_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Description *
                    <input
                      value={promiseContext.disputeDescription}
                      onChange={(event) =>
                        promiseContext.onDisputeDescriptionChange(event.target.value)
                      }
                      placeholder="опис спору"
                      autoComplete="off"
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  <label>
                    Responsible party *
                    <select
                      value={promiseContext.disputeParty}
                      onChange={(event) =>
                        promiseContext.onDisputePartyChange(
                          event.target.value as DisputeParty | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть сторону…</option>
                      {DISPUTE_PARTY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Next review date
                    <input
                      type="date"
                      value={promiseContext.disputeReviewAt}
                      onChange={(event) =>
                        promiseContext.onDisputeReviewAtChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.disputeReason ||
                        !promiseContext.disputeDescription.trim() ||
                        !promiseContext.disputeParty
                      }
                    >
                      {promiseContext.busy
                        ? "Збереження…"
                        : promiseContext.disputeEditMode
                          ? "Save dispute update"
                          : "Save dispute"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseDisputeForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.disputeOpen && promiseContext.disputeCloseMode ? (
                <form
                  className="filter-form dispute-close-form"
                  aria-labelledby="collection-dispute-close-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onConfirmCloseDispute();
                  }}
                >
                  <h4 id="collection-dispute-close-heading">
                    {promiseContext.disputeCloseMode === "resolve"
                      ? "Resolve dispute"
                      : "Reject dispute"}
                  </h4>
                  <label>
                    Resolution comment *
                    <input
                      value={promiseContext.disputeCloseComment}
                      onChange={(event) =>
                        promiseContext.onDisputeCloseCommentChange(event.target.value)
                      }
                      placeholder="підсумковий коментар"
                      autoComplete="off"
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.disputeCloseComment.trim()
                      }
                    >
                      {promiseContext.busy
                        ? "Збереження…"
                        : promiseContext.disputeCloseMode === "resolve"
                          ? "Resolve dispute"
                          : "Reject dispute"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseDisputeForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {!promiseContext.formOpen &&
              !promiseContext.resolutionOpen &&
              !promiseContext.contactOpen &&
              !promiseContext.disputeOpen ? (
                <div className="filter-actions">
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenContact}
                  >
                    Log contact
                  </button>
                  {isActiveDispute(promiseContext.record?.dispute) ? (
                    <>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenEditDispute}
                      >
                        Update dispute
                      </button>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenResolveDispute}
                      >
                        Resolve dispute
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenRejectDispute}
                      >
                        Reject dispute
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenRaiseDispute}
                    >
                      Raise dispute
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenForm}
                  >
                    {promiseContext.record ? "Update promise" : "Promise to pay"}
                  </button>
                  {promiseContext.record ? (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenResolution}
                    >
                      Resolve collection
                    </button>
                  ) : null}
                  {promiseContext.record && promiseStatus !== "completed" ? (
                    <>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onMarkFollowUpRequired}
                      >
                        Mark follow-up required
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onMarkContacted}
                      >
                        Mark contacted
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onComplete}
                      >
                        Complete follow-up
                      </button>
                    </>
                  ) : null}
                  {promiseContext.record && promiseStatus === "completed" ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onReopen}
                    >
                      Reopen follow-up
                    </button>
                  ) : null}
                </div>
              ) : null}
              <p className="meta promise-persistence-note">
                Contact, dispute, follow-up і resolution зберігаються локально в браузері
                (localStorage) за invoice id.
              </p>
            </section>
          ) : null}

          {historyContext ? (
            <section
              className="case-history-block"
              aria-labelledby="case-history-heading"
            >
              <div className="filter-actions">
                <h4 id="case-history-heading">Case history</h4>
                {!historyContext.open ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={closeDisabled}
                    onClick={historyContext.onOpen}
                  >
                    Open history
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={closeDisabled}
                    onClick={historyContext.onClose}
                  >
                    Close history
                  </button>
                )}
              </div>

              {historyContext.open && historyContext.view ? (
                <>
                  <dl className="collections-summary facts collections-kpi case-history-summary">
                    <div>
                      <dt>Current Status</dt>
                      <dd>{historyContext.view.summary.currentStatus}</dd>
                    </div>
                    <div>
                      <dt>Current Promise</dt>
                      <dd>{historyContext.view.summary.currentPromise ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Last Contact</dt>
                      <dd>
                        {formatDate(historyContext.view.summary.lastContactAtUtc)}
                      </dd>
                    </div>
                    <div>
                      <dt>Last Resolution</dt>
                      <dd>{historyContext.view.summary.lastResolutionLabel ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Total Follow-ups</dt>
                      <dd>{historyContext.view.summary.totalFollowUps}</dd>
                    </div>
                    <div>
                      <dt>Total Promises</dt>
                      <dd>{historyContext.view.summary.totalPromises}</dd>
                    </div>
                  </dl>

                  <form
                    className="filter-form promise-search-form"
                    onSubmit={historyContext.onSearchSubmit}
                  >
                    <label>
                      Пошук у нотатках
                      <input
                        value={historyContext.searchDraft}
                        onChange={(event) =>
                          historyContext.onSearchDraftChange(event.target.value)
                        }
                        placeholder="note / description"
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      Тип події
                      <select
                        value={historyContext.typeFilter}
                        onChange={(event) =>
                          historyContext.onTypeChange(
                            event.target.value as CollectionActivityEventTypeFilter
                          )
                        }
                      >
                        {ACTIVITY_EVENT_TYPE_OPTIONS.map((option) => (
                          <option key={option.id || "all-events"} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="filter-actions">
                      <button type="submit">Знайти</button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={historyContext.onToggleExpanded}
                      >
                        {historyContext.view.collapsed
                          ? "Показати всю історію"
                          : "Згорнути історію"}
                      </button>
                    </div>
                  </form>

                  <p className="meta">
                    Activity timeline · {historyContext.view.visibleCount} /{" "}
                    {historyContext.view.totalCount}
                    {historyContext.view.collapsed ? " · collapsed" : ""}
                  </p>

                  {historyContext.view.events.length === 0 ? (
                    <p className="meta">Подій за поточними фільтрами немає.</p>
                  ) : (
                    <ol className="case-history-timeline">
                      {historyContext.view.events.map((event) => (
                        <li key={event.id} className="case-history-event">
                          <div className="case-history-event-head">
                            <span
                              className={`aging-badge aging-badge--promise aging-badge--history-${event.type}`}
                            >
                              {activityEventTypeLabel(event.type)}
                            </span>
                            <time dateTime={event.atUtc}>{formatDate(event.atUtc)}</time>
                          </div>
                          <p className="case-history-description">{event.description}</p>
                          {event.note ? (
                            <p className="meta cell-wrap">Note: {event.note}</p>
                          ) : null}
                          {event.contactChannel || event.contactResult ? (
                            <p className="meta">
                              {event.contactChannel
                                ? contactChannelLabel(event.contactChannel)
                                : "Contact"}
                              {event.contactResult
                                ? ` · ${contactResultLabel(event.contactResult)}`
                                : ""}
                            </p>
                          ) : null}
                          {event.followUpAt ? (
                            <p className="meta">
                              {event.type.startsWith("dispute_")
                                ? `Review: ${event.followUpAt}`
                                : `Follow-up: ${event.followUpAt}`}
                            </p>
                          ) : null}
                          {event.disputeReason || event.disputeParty ? (
                            <p className="meta">
                              {event.disputeReason
                                ? disputeReasonLabel(event.disputeReason)
                                : "Dispute"}
                              {event.disputeParty
                                ? ` · ${disputePartyLabel(event.disputeParty)}`
                                : ""}
                            </p>
                          ) : null}
                          {event.promiseDate &&
                          event.type !== "contact_logged" &&
                          !event.type.startsWith("dispute_") ? (
                            <p className="meta">Promise date: {event.promiseDate}</p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              ) : null}
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
