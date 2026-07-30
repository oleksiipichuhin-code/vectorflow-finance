import { useTranslation } from "react-i18next";
import type { Accrual } from "../api";
import {
  buildAccrualDetailFields,
  canEditAccrualFromDetails,
  canManageAccrualLifecycleFromDetails,
  canOpenSourceInvoiceFromDetails,
  detailLifecycleActionsFor,
  sourceInvoiceIdForOpen,
  type SourceInvoiceDetailView
} from "../accrualDetail";
import { StatusMessage } from "./Panel";

type AccrualDetailPanelProps = {
  accrual: Accrual | null;
  loading: boolean;
  error: string | null;
  errorRetryable: boolean;
  sourceInvoice: SourceInvoiceDetailView;
  /** Disables Close and all detail action buttons while loading or pending. */
  editActionsDisabled?: boolean;
  recognizeBusy?: boolean;
  reverseBusy?: boolean;
  reverseOpen?: boolean;
  onClose: () => void;
  onRetry: () => void;
  onRetrySourceInvoice: () => void;
  onEditDetails?: (accrual: Accrual) => void;
  onEditAmount?: (accrual: Accrual) => void;
  onEditSourceInvoice?: (accrual: Accrual) => void;
  onRecognize?: (accrual: Accrual) => void;
  onReverse?: (accrual: Accrual) => void;
  /** Cross-view handoff: open Invoices detail for the linked source invoice. */
  onOpenInvoice?: (invoiceId: string) => void;
};

export function AccrualDetailPanel({
  accrual,
  loading,
  error,
  errorRetryable,
  sourceInvoice,
  editActionsDisabled = false,
  recognizeBusy = false,
  reverseBusy = false,
  reverseOpen = false,
  onClose,
  onRetry,
  onRetrySourceInvoice,
  onEditDetails,
  onEditAmount,
  onEditSourceInvoice,
  onRecognize,
  onReverse,
  onOpenInvoice
}: AccrualDetailPanelProps) {
  const { t } = useTranslation(["finance", "common"]);
  const fields = accrual ? buildAccrualDetailFields(accrual) : null;
  const showEditActions =
    accrual !== null &&
    canEditAccrualFromDetails(accrual) &&
    Boolean(onEditDetails && onEditAmount && onEditSourceInvoice);
  const lifecycleActions = accrual ? detailLifecycleActionsFor(accrual) : [];
  const showRecognize =
    accrual !== null &&
    canManageAccrualLifecycleFromDetails(accrual) &&
    lifecycleActions.includes("recognize") &&
    Boolean(onRecognize);
  const showReverse =
    accrual !== null &&
    canManageAccrualLifecycleFromDetails(accrual) &&
    lifecycleActions.includes("reverse") &&
    Boolean(onReverse);
  const openSourceInvoiceId = accrual ? sourceInvoiceIdForOpen(accrual) : null;
  const showOpenSourceInvoice =
    accrual !== null &&
    canOpenSourceInvoiceFromDetails(accrual) &&
    openSourceInvoiceId !== null &&
    Boolean(onOpenInvoice);
  const showActions = showEditActions || showRecognize || showReverse;

  function statusLabel(status: string): string {
    if (status === "Draft" || status === "Recognized" || status === "Reversed") {
      return t(`accrualStatus.${status}`);
    }

    return status;
  }

  function typeLabel(type: string): string {
    if (type === "Revenue" || type === "Expense") {
      return t(`type.${type}`);
    }

    return type;
  }

  return (
    <section
      className="issue-prepare-form accrual-detail-panel"
      aria-labelledby="accrual-detail-heading"
    >
      <div className="panel-header">
        <h3 id="accrual-detail-heading">{t("accruals.detail.title")}</h3>
        <button
          type="button"
          className="button-secondary"
          onClick={onClose}
          disabled={editActionsDisabled}
        >
          {t("close", { ns: "common" })}
        </button>
      </div>

      {loading ? <StatusMessage>{t("accruals.detail.loading")}</StatusMessage> : null}

      {!loading && error ? (
        <div className="state-actions" role="alert">
          <StatusMessage tone="error">{error}</StatusMessage>
          {errorRetryable ? (
            <button type="button" onClick={onRetry}>
              {t("retry", { ns: "common" })}
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && fields && accrual ? (
        <>
          <p className="meta cell-wrap">{fields.description}</p>
          <dl className="facts">
            <div>
              <dt>{t("accruals.detail.field.status")}</dt>
              <dd>{statusLabel(fields.status)}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.type")}</dt>
              <dd>{typeLabel(fields.type)}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.amount")}</dt>
              <dd>{fields.amountDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.currency")}</dt>
              <dd>{fields.currency}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.recognitionDate")}</dt>
              <dd>{fields.recognitionDateDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.sourceInvoice")}</dt>
              <dd className="cell-wrap">
                {sourceInvoice.kind === "none" ? sourceInvoice.display : null}
                {sourceInvoice.kind === "loading" ? t("loading", { ns: "common" }) : null}
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
                      {t("retry", { ns: "common" })}
                    </button>
                  </span>
                ) : null}
                {showOpenSourceInvoice && openSourceInvoiceId ? (
                  <span className="state-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={editActionsDisabled}
                      onClick={() => onOpenInvoice?.(openSourceInvoiceId)}
                    >
                      {t("accruals.detail.openInvoice")}
                    </button>
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.created")}</dt>
              <dd>{fields.createdAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.updated")}</dt>
              <dd>{fields.updatedAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.recognized")}</dt>
              <dd>{fields.recognizedAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.reversed")}</dt>
              <dd>{fields.reversedAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.reversalReason")}</dt>
              <dd className="cell-wrap">{fields.reversalReasonDisplay}</dd>
            </div>
            <div>
              <dt>{t("accruals.detail.field.id")}</dt>
              <dd className="mono">{fields.accrualId}</dd>
            </div>
          </dl>

          {showActions ? (
            <div className="filter-actions accrual-detail-actions">
              <p className="meta">{t("accruals.detail.actionsTitle")}</p>
              {showEditActions ? (
                <>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={editActionsDisabled}
                    onClick={() => onEditDetails?.(accrual)}
                  >
                    {t("accruals.detail.editDetails")}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={editActionsDisabled}
                    onClick={() => onEditAmount?.(accrual)}
                  >
                    {t("accruals.editAmountAction")}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={editActionsDisabled}
                    onClick={() => onEditSourceInvoice?.(accrual)}
                  >
                    {t("accruals.editSourceInvoiceAction")}
                  </button>
                </>
              ) : null}
              {showRecognize ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={editActionsDisabled || recognizeBusy}
                  onClick={() => onRecognize?.(accrual)}
                >
                  {recognizeBusy
                    ? t("accruals.recognizingAction")
                    : t("accruals.recognizeAction")}
                </button>
              ) : null}
              {showReverse ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={editActionsDisabled || reverseBusy || reverseOpen}
                  onClick={() => onReverse?.(accrual)}
                >
                  {reverseBusy ? t("accruals.reversingAction") : t("accruals.reverseAction")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
