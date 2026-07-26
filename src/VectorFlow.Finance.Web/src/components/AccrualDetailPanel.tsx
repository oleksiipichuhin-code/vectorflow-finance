import type { Accrual } from "../api";
import {
  buildAccrualDetailFields,
  canEditAccrualFromDetails,
  type SourceInvoiceDetailView
} from "../accrualDetail";
import { StatusMessage } from "./Panel";

type AccrualDetailPanelProps = {
  accrual: Accrual | null;
  loading: boolean;
  error: string | null;
  errorRetryable: boolean;
  sourceInvoice: SourceInvoiceDetailView;
  editActionsDisabled?: boolean;
  onClose: () => void;
  onRetry: () => void;
  onRetrySourceInvoice: () => void;
  onEditDetails?: (accrual: Accrual) => void;
  onEditAmount?: (accrual: Accrual) => void;
  onEditSourceInvoice?: (accrual: Accrual) => void;
};

export function AccrualDetailPanel({
  accrual,
  loading,
  error,
  errorRetryable,
  sourceInvoice,
  editActionsDisabled = false,
  onClose,
  onRetry,
  onRetrySourceInvoice,
  onEditDetails,
  onEditAmount,
  onEditSourceInvoice
}: AccrualDetailPanelProps) {
  const fields = accrual ? buildAccrualDetailFields(accrual) : null;
  const showEditActions =
    accrual !== null &&
    canEditAccrualFromDetails(accrual) &&
    Boolean(onEditDetails && onEditAmount && onEditSourceInvoice);

  return (
    <section
      className="issue-prepare-form accrual-detail-panel"
      aria-labelledby="accrual-detail-heading"
    >
      <div className="panel-header">
        <h3 id="accrual-detail-heading">Деталі нарахування</h3>
        <button
          type="button"
          className="button-secondary"
          onClick={onClose}
          disabled={editActionsDisabled}
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

      {!loading && !error && fields && accrual ? (
        <>
          <p className="meta cell-wrap">{fields.description}</p>
          <dl className="facts">
            <div>
              <dt>Статус</dt>
              <dd>{fields.status}</dd>
            </div>
            <div>
              <dt>Тип</dt>
              <dd>{fields.type}</dd>
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
              <dt>Дата визнання</dt>
              <dd>{fields.recognitionDateDisplay}</dd>
            </div>
            <div>
              <dt>Рахунок-джерело</dt>
              <dd className="cell-wrap">
                {sourceInvoice.kind === "none" ? sourceInvoice.display : null}
                {sourceInvoice.kind === "loading" ? "Завантаження…" : null}
                {sourceInvoice.kind === "ready" ? sourceInvoice.display : null}
                {sourceInvoice.kind === "unavailable" ? sourceInvoice.message : null}
                {sourceInvoice.kind === "error" ? (
                  <span className="state-actions">
                    <span>{sourceInvoice.message}</span>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={onRetrySourceInvoice}
                    >
                      Спробувати знову
                    </button>
                  </span>
                ) : null}
              </dd>
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
              <dt>Визнано</dt>
              <dd>{fields.recognizedAtDisplay}</dd>
            </div>
            <div>
              <dt>Сторновано</dt>
              <dd>{fields.reversedAtDisplay}</dd>
            </div>
            <div>
              <dt>Причина сторно</dt>
              <dd className="cell-wrap">{fields.reversalReasonDisplay}</dd>
            </div>
            <div>
              <dt>Id</dt>
              <dd className="mono">{fields.accrualId}</dd>
            </div>
          </dl>

          {showEditActions ? (
            <div className="filter-actions accrual-detail-actions">
              <p className="meta">Дії</p>
              <button
                type="button"
                className="button-secondary"
                disabled={editActionsDisabled}
                onClick={() => onEditDetails?.(accrual)}
              >
                Редагувати реквізити
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={editActionsDisabled}
                onClick={() => onEditAmount?.(accrual)}
              >
                Змінити суму
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={editActionsDisabled}
                onClick={() => onEditSourceInvoice?.(accrual)}
              >
                Змінити рахунок
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
