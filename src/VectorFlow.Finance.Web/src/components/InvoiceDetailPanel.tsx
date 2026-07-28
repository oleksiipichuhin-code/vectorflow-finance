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
  CollectionNoteCategory,
  EscalationStatus,
  PaymentPlanStatus,
  PromiseFollowUpStatus,
  PromiseToPayRecord
} from "../promiseToPay";
import {
  RESOLUTION_KIND_OPTIONS,
  computeInstallmentStatus,
  countPaidInstallments,
  disputeStatusLabel,
  escalationStatusLabel,
  hasOverdueInstallment,
  installmentStatusLabel,
  isActiveDispute,
  isActiveEscalation,
  isActiveCollectionNote,
  isActivePaymentPlan,
  listActiveCollectionNotes,
  listOverdueInstallments,
  paymentPlanStatusLabel,
  planInstallmentRemaining,
  planPaidTotal,
  planRemainingTotal,
  noteCategoryLabel,
  promiseStatusLabel,
  resolutionKindLabel,
  sortCollectionNotesForDisplay,
  NOTE_CATEGORY_OPTIONS,
  selectNextInstallment
} from "../promiseToPay";
import type { PaymentPlanInstallmentInput } from "../paymentPlan";
import {
  ACTIVITY_EVENT_TYPE_OPTIONS,
  CONTACT_CHANNEL_OPTIONS,
  CONTACT_RESULT_OPTIONS,
  DISPUTE_PARTY_OPTIONS,
  DISPUTE_REASON_OPTIONS,
  ESCALATION_PRIORITY_OPTIONS,
  ESCALATION_REASON_OPTIONS,
  ESCALATION_TEAM_OPTIONS,
  activityEventTypeLabel,
  contactChannelLabel,
  contactResultLabel,
  disputePartyLabel,
  disputeReasonLabel,
  escalationPriorityLabel,
  escalationReasonLabel,
  escalationTeamLabel,
  type CaseHistoryView,
  type CollectionActivityEventTypeFilter,
  type ContactChannel,
  type ContactResult,
  type DisputeParty,
  type DisputeReason,
  type EscalationPriority,
  type EscalationReason,
  type EscalationTeam
} from "../collectionCaseHistory";
import { StatusMessage } from "./Panel";
import type { DisputeStatus } from "../promiseToPay";

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
  escalationOpen: boolean;
  escalationEditMode: boolean;
  escalationCompleteMode: boolean;
  escalationReason: EscalationReason | "";
  escalationPriority: EscalationPriority | "";
  escalationTeam: EscalationTeam | "";
  escalationRequestedAction: string;
  escalationDueDate: string;
  escalationNote: string;
  escalationCompleteComment: string;
  notesOpen: boolean;
  notesEditId: string;
  noteBody: string;
  noteAuthor: string;
  noteCategory: CollectionNoteCategory | "";
  notePinned: boolean;
  paymentPlanOpen: boolean;
  paymentPlanEditMode: boolean;
  paymentPlanCancelMode: boolean;
  paymentPlanRecordMode: boolean;
  paymentPlanAmount: string;
  paymentPlanInstallments: PaymentPlanInstallmentInput[];
  paymentPlanReplacePromise: boolean;
  paymentPlanCancelReason: string;
  paymentPlanRecordInstallmentId: string;
  paymentPlanRecordAmount: string;
  paymentPlanRecordNote: string;
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
  onOpenEscalateCase: () => void;
  onOpenEditEscalation: () => void;
  onOpenCompleteEscalation: () => void;
  onCloseEscalationForm: () => void;
  onEscalationReasonChange: (value: EscalationReason | "") => void;
  onEscalationPriorityChange: (value: EscalationPriority | "") => void;
  onEscalationTeamChange: (value: EscalationTeam | "") => void;
  onEscalationRequestedActionChange: (value: string) => void;
  onEscalationDueDateChange: (value: string) => void;
  onEscalationNoteChange: (value: string) => void;
  onEscalationCompleteCommentChange: (value: string) => void;
  onSaveEscalation: () => void;
  onConfirmCompleteEscalation: () => void;
  onOpenAddNote: () => void;
  onOpenEditNote: (noteId: string) => void;
  onCloseNotesForm: () => void;
  onNoteBodyChange: (value: string) => void;
  onNoteAuthorChange: (value: string) => void;
  onNoteCategoryChange: (value: CollectionNoteCategory | "") => void;
  onNotePinnedChange: (value: boolean) => void;
  onSaveNote: () => void;
  onArchiveNote: (noteId: string) => void;
  onOpenCreatePaymentPlan: () => void;
  onOpenEditPaymentPlan: () => void;
  onOpenCancelPaymentPlan: () => void;
  onOpenRecordInstallmentPayment: (installmentId: string) => void;
  onClosePaymentPlanForm: () => void;
  onPaymentPlanAmountChange: (value: string) => void;
  onPaymentPlanReplacePromiseChange: (value: boolean) => void;
  onPaymentPlanCancelReasonChange: (value: string) => void;
  onPaymentPlanRecordAmountChange: (value: string) => void;
  onPaymentPlanRecordNoteChange: (value: string) => void;
  onAddPaymentPlanInstallment: () => void;
  onRemovePaymentPlanInstallment: (index: number) => void;
  onPaymentPlanInstallmentDueDateChange: (index: number, value: string) => void;
  onPaymentPlanInstallmentAmountChange: (index: number, value: string) => void;
  onSavePaymentPlan: () => void;
  onConfirmCancelPaymentPlan: () => void;
  onConfirmRecordInstallmentPayment: () => void;
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
    Boolean(promiseContext?.disputeOpen) ||
    Boolean(promiseContext?.escalationOpen) ||
    Boolean(promiseContext?.paymentPlanOpen);

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
                  <div className="collection-notes-list">
                    <dt>Internal notes</dt>
                    <dd>
                      {(() => {
                        const activeNotes = sortCollectionNotesForDisplay(
                          listActiveCollectionNotes(promiseContext.record.notes)
                        );
                        if (activeNotes.length === 0) {
                          return "0 active";
                        }
                        return (
                          <>
                            <span>{activeNotes.length} active</span>
                            {activeNotes.map((note) => (
                              <span
                                key={note.id}
                                className={`collection-note-item${
                                  note.pinned ? " collection-note-item--pinned" : ""
                                }`}
                              >
                                {note.category === "handoff" ? (
                                  <span className="aging-badge aging-badge--note-handoff">
                                    Handoff
                                  </span>
                                ) : null}
                                {note.pinned ? "Pinned · " : ""}
                                {noteCategoryLabel(note.category)} · {note.author} ·{" "}
                                {note.body.length > 120
                                  ? `${note.body.slice(0, 117)}…`
                                  : note.body}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </dd>
                  </div>
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
                  {promiseContext.record.escalation ? (
                    <>
                      <div>
                        <dt>Escalation</dt>
                        <dd>
                          <span
                            className={`aging-badge aging-badge--promise aging-badge--escalation-${promiseContext.record.escalation.status as EscalationStatus}${
                              promiseContext.record.escalation.priority === "critical" &&
                              promiseContext.record.escalation.status === "open"
                                ? " aging-badge--escalation-critical"
                                : ""
                            }`}
                          >
                            {escalationStatusLabel(promiseContext.record.escalation.status)}
                          </span>
                          {" · "}
                          {escalationPriorityLabel(promiseContext.record.escalation.priority)}
                          {" · "}
                          {escalationReasonLabel(promiseContext.record.escalation.reason)}
                        </dd>
                      </div>
                      <div>
                        <dt>Responsible team</dt>
                        <dd>
                          {escalationTeamLabel(
                            promiseContext.record.escalation.responsibleTeam
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Requested action</dt>
                        <dd className="cell-wrap">
                          {promiseContext.record.escalation.requestedAction}
                        </dd>
                      </div>
                      <div>
                        <dt>Escalation due</dt>
                        <dd>{promiseContext.record.escalation.dueDate}</dd>
                      </div>
                      <div>
                        <dt>Escalation opened</dt>
                        <dd>
                          {formatDate(promiseContext.record.escalation.openedAtUtc)}
                        </dd>
                      </div>
                      {promiseContext.record.escalation.completionComment ? (
                        <div>
                          <dt>Escalation outcome</dt>
                          <dd className="cell-wrap">
                            {promiseContext.record.escalation.completionComment}
                          </dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {promiseContext.record.paymentPlan ? (
                    <>
                      <div>
                        <dt>Payment plan</dt>
                        <dd>
                          <span
                            className={`aging-badge aging-badge--promise aging-badge--payment-plan-${promiseContext.record.paymentPlan.status as PaymentPlanStatus}${
                              hasOverdueInstallment(promiseContext.record.paymentPlan)
                                ? " aging-badge--payment-plan-overdue"
                                : ""
                            }`}
                          >
                            {paymentPlanStatusLabel(promiseContext.record.paymentPlan.status)}
                          </span>
                          {hasOverdueInstallment(promiseContext.record.paymentPlan)
                            ? " · overdue installment"
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Plan amount</dt>
                        <dd>
                          {formatMoney(
                            promiseContext.record.paymentPlan.planAmount,
                            promiseContext.record.paymentPlan.currency
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Paid / remaining</dt>
                        <dd>
                          {formatMoney(
                            planPaidTotal(promiseContext.record.paymentPlan),
                            promiseContext.record.paymentPlan.currency
                          )}
                          {" / "}
                          {formatMoney(
                            planRemainingTotal(promiseContext.record.paymentPlan),
                            promiseContext.record.paymentPlan.currency
                          )}
                          {" · "}
                          {(() => {
                            const counts = countPaidInstallments(
                              promiseContext.record.paymentPlan
                            );
                            return `${counts.paid}/${counts.total} paid`;
                          })()}
                        </dd>
                      </div>
                      {(() => {
                        const next = selectNextInstallment(
                          promiseContext.record.paymentPlan
                        );
                        return next ? (
                          <div>
                            <dt>Next installment</dt>
                            <dd>
                              #{next.sequence} · {next.dueDate} ·{" "}
                              {formatMoney(
                                planInstallmentRemaining(next),
                                promiseContext.record.paymentPlan.currency
                              )}{" "}
                              remaining
                            </dd>
                          </div>
                        ) : null;
                      })()}
                      {listOverdueInstallments(promiseContext.record.paymentPlan).length >
                      0 ? (
                        <div>
                          <dt>Overdue installments</dt>
                          <dd>
                            {listOverdueInstallments(promiseContext.record.paymentPlan)
                              .map((item) => `#${item.sequence}`)
                              .join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      {promiseContext.record.paymentPlan.cancellationReason ? (
                        <div>
                          <dt>Cancellation reason</dt>
                          <dd className="cell-wrap">
                            {promiseContext.record.paymentPlan.cancellationReason}
                          </dd>
                        </div>
                      ) : null}
                      <div className="payment-plan-schedule">
                        <dt>Schedule</dt>
                        <dd>
                          <table className="data-table payment-plan-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Due</th>
                                <th>Expected</th>
                                <th>Recorded</th>
                                <th>Remaining</th>
                                <th>Status</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const plan = promiseContext.record!.paymentPlan!;
                                const currency = plan.currency;
                                return plan.installments.map((item) => {
                                  const status = computeInstallmentStatus(item);
                                  const remaining = planInstallmentRemaining(item);
                                  const canRecord =
                                    isActivePaymentPlan(plan) &&
                                    status !== "Paid" &&
                                    !promiseContext.paymentPlanOpen;
                                  return (
                                    <tr
                                      key={item.id}
                                      className={
                                        status === "Overdue"
                                          ? "row-attention row-attention--payment-overdue"
                                          : undefined
                                      }
                                    >
                                      <td>{item.sequence}</td>
                                      <td>{item.dueDate}</td>
                                      <td>
                                        {formatMoney(item.expectedAmount, currency)}
                                      </td>
                                      <td>
                                        {formatMoney(item.recordedPaidAmount, currency)}
                                      </td>
                                      <td>{formatMoney(remaining, currency)}</td>
                                      <td>
                                        <span
                                          className={`aging-badge aging-badge--installment-${status === "Partially paid" ? "partial" : status.toLowerCase()}`}
                                        >
                                          {installmentStatusLabel(status)}
                                        </span>
                                      </td>
                                      <td>
                                        {canRecord ? (
                                          <button
                                            type="button"
                                            className="button-secondary"
                                            disabled={
                                              closeDisabled || promiseContext.busy
                                            }
                                            onClick={() =>
                                              promiseContext.onOpenRecordInstallmentPayment(
                                                item.id
                                              )
                                            }
                                          >
                                            Record payment
                                          </button>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                          <p className="meta">
                            Recorded amounts are for collection tracking only — they do not
                            post ledger payments.
                          </p>
                        </dd>
                      </div>
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

              {promiseContext.escalationOpen && !promiseContext.escalationCompleteMode ? (
                <form
                  className="filter-form escalation-form"
                  aria-labelledby="collection-escalation-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSaveEscalation();
                  }}
                >
                  <h4 id="collection-escalation-heading">
                    {promiseContext.escalationEditMode
                      ? "Update escalation"
                      : "Escalate case"}
                  </h4>
                  <label>
                    Reason *
                    <select
                      value={promiseContext.escalationReason}
                      onChange={(event) =>
                        promiseContext.onEscalationReasonChange(
                          event.target.value as EscalationReason | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть причину…</option>
                      {ESCALATION_REASON_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority *
                    <select
                      value={promiseContext.escalationPriority}
                      onChange={(event) =>
                        promiseContext.onEscalationPriorityChange(
                          event.target.value as EscalationPriority | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть пріоритет…</option>
                      {ESCALATION_PRIORITY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Responsible team *
                    <select
                      value={promiseContext.escalationTeam}
                      onChange={(event) =>
                        promiseContext.onEscalationTeamChange(
                          event.target.value as EscalationTeam | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть підрозділ…</option>
                      {ESCALATION_TEAM_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Requested action *
                    <textarea
                      value={promiseContext.escalationRequestedAction}
                      onChange={(event) =>
                        promiseContext.onEscalationRequestedActionChange(
                          event.target.value
                        )
                      }
                      placeholder="очікувана наступна дія"
                      disabled={promiseContext.busy}
                      required
                      rows={2}
                    />
                  </label>
                  <label>
                    Due date *
                    <input
                      type="date"
                      value={promiseContext.escalationDueDate}
                      onChange={(event) =>
                        promiseContext.onEscalationDueDateChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  {!promiseContext.escalationEditMode ? (
                    <label>
                      Note
                      <input
                        value={promiseContext.escalationNote}
                        onChange={(event) =>
                          promiseContext.onEscalationNoteChange(event.target.value)
                        }
                        placeholder="optional"
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
                        !promiseContext.escalationReason ||
                        !promiseContext.escalationPriority ||
                        !promiseContext.escalationTeam ||
                        !promiseContext.escalationRequestedAction.trim() ||
                        !promiseContext.escalationDueDate
                      }
                    >
                      {promiseContext.busy
                        ? "Збереження…"
                        : promiseContext.escalationEditMode
                          ? "Save escalation update"
                          : "Save escalation"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseEscalationForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.escalationOpen && promiseContext.escalationCompleteMode ? (
                <form
                  className="filter-form escalation-complete-form"
                  aria-labelledby="collection-escalation-complete-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onConfirmCompleteEscalation();
                  }}
                >
                  <h4 id="collection-escalation-complete-heading">
                    Complete escalation
                  </h4>
                  <label>
                    Completion comment *
                    <input
                      value={promiseContext.escalationCompleteComment}
                      onChange={(event) =>
                        promiseContext.onEscalationCompleteCommentChange(
                          event.target.value
                        )
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
                        !promiseContext.escalationCompleteComment.trim()
                      }
                    >
                      {promiseContext.busy ? "Збереження…" : "Complete escalation"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseEscalationForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.paymentPlanOpen &&
              !promiseContext.paymentPlanCancelMode &&
              !promiseContext.paymentPlanRecordMode ? (
                <form
                  className="filter-form payment-plan-form"
                  aria-labelledby="collection-payment-plan-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSavePaymentPlan();
                  }}
                >
                  <h4 id="collection-payment-plan-heading">
                    {promiseContext.paymentPlanEditMode
                      ? "Edit payment plan"
                      : "Create payment plan"}
                  </h4>
                  <p className="meta">
                    Operational collection schedule only. Saving does not post a ledger
                    payment or mark the invoice paid.
                  </p>
                  <label>
                    Plan amount *
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={promiseContext.paymentPlanAmount}
                      onChange={(event) =>
                        promiseContext.onPaymentPlanAmountChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                    />
                  </label>
                  {!promiseContext.paymentPlanEditMode ? (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={promiseContext.paymentPlanReplacePromise}
                        onChange={(event) =>
                          promiseContext.onPaymentPlanReplacePromiseChange(
                            event.target.checked
                          )
                        }
                        disabled={promiseContext.busy}
                      />
                      Replace active Promise to Pay with this installment schedule
                    </label>
                  ) : null}
                  <div className="payment-plan-installment-editor">
                    <h5>Installments</h5>
                    {promiseContext.paymentPlanInstallments.map((row, index) => {
                      const locked =
                        promiseContext.paymentPlanEditMode &&
                        Number(row.recordedPaidAmount ?? 0) > 0;
                      return (
                        <div key={row.id ?? `new-${index}`} className="payment-plan-row">
                          <label>
                            Due date *
                            <input
                              type="date"
                              required
                              value={row.dueDate ?? ""}
                              onChange={(event) =>
                                promiseContext.onPaymentPlanInstallmentDueDateChange(
                                  index,
                                  event.target.value
                                )
                              }
                              disabled={promiseContext.busy || locked}
                            />
                          </label>
                          <label>
                            Amount *
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                              value={
                                row.expectedAmount === undefined ||
                                row.expectedAmount === null
                                  ? ""
                                  : String(row.expectedAmount)
                              }
                              onChange={(event) =>
                                promiseContext.onPaymentPlanInstallmentAmountChange(
                                  index,
                                  event.target.value
                                )
                              }
                              disabled={promiseContext.busy || locked}
                            />
                          </label>
                          {locked ? (
                            <p className="meta">Paid / partial — locked</p>
                          ) : (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                promiseContext.busy ||
                                promiseContext.paymentPlanInstallments.length <= 1
                              }
                              onClick={() =>
                                promiseContext.onRemovePaymentPlanInstallment(index)
                              }
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy}
                      onClick={promiseContext.onAddPaymentPlanInstallment}
                    >
                      Add installment
                    </button>
                    <p className="meta">
                      Installment total:{" "}
                      {promiseContext.paymentPlanInstallments
                        .reduce((sum, row) => {
                          const amount = Number(
                            String(row.expectedAmount ?? "")
                              .trim()
                              .replace(",", ".")
                          );
                          return sum + (Number.isFinite(amount) ? amount : 0);
                        }, 0)
                        .toFixed(2)}
                      {invoice ? ` ${invoice.currency}` : ""}
                    </p>
                  </div>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.paymentPlanAmount ||
                        promiseContext.paymentPlanInstallments.length === 0 ||
                        (!promiseContext.paymentPlanEditMode &&
                          !promiseContext.paymentPlanReplacePromise &&
                          Boolean(promiseContext.record))
                      }
                    >
                      {promiseContext.busy
                        ? "Збереження…"
                        : promiseContext.paymentPlanEditMode
                          ? "Save payment plan update"
                          : "Save payment plan"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onClosePaymentPlanForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.paymentPlanOpen && promiseContext.paymentPlanCancelMode ? (
                <form
                  className="filter-form payment-plan-cancel-form"
                  aria-labelledby="collection-payment-plan-cancel-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onConfirmCancelPaymentPlan();
                  }}
                >
                  <h4 id="collection-payment-plan-cancel-heading">
                    Cancel payment plan
                  </h4>
                  <label>
                    Cancellation reason *
                    <input
                      value={promiseContext.paymentPlanCancelReason}
                      onChange={(event) =>
                        promiseContext.onPaymentPlanCancelReasonChange(event.target.value)
                      }
                      placeholder="обовʼязкова причина"
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
                        !promiseContext.paymentPlanCancelReason.trim()
                      }
                    >
                      {promiseContext.busy ? "Збереження…" : "Cancel payment plan"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onClosePaymentPlanForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.paymentPlanOpen && promiseContext.paymentPlanRecordMode ? (
                <form
                  className="filter-form payment-plan-record-form"
                  aria-labelledby="collection-payment-plan-record-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onConfirmRecordInstallmentPayment();
                  }}
                >
                  <h4 id="collection-payment-plan-record-heading">
                    Record payment for collection tracking
                  </h4>
                  <p className="meta">
                    This records an operational payment against the installment. It does
                    not create a ledger posting.
                  </p>
                  <label>
                    Amount *
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={promiseContext.paymentPlanRecordAmount}
                      onChange={(event) =>
                        promiseContext.onPaymentPlanRecordAmountChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <label>
                    Note
                    <input
                      value={promiseContext.paymentPlanRecordNote}
                      onChange={(event) =>
                        promiseContext.onPaymentPlanRecordNoteChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      placeholder="optional"
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.paymentPlanRecordAmount
                      }
                    >
                      {promiseContext.busy
                        ? "Збереження…"
                        : "Payment recorded for collection tracking"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onClosePaymentPlanForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.notesOpen ? (
                <form
                  className="filter-form collection-notes-form"
                  aria-labelledby="collection-notes-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSaveNote();
                  }}
                >
                  <h4 id="collection-notes-heading">
                    {promiseContext.notesEditId ? "Update internal note" : "Add internal note"}
                  </h4>
                  <label>
                    Author *
                    <input
                      value={promiseContext.noteAuthor}
                      onChange={(event) =>
                        promiseContext.onNoteAuthorChange(event.target.value)
                      }
                      autoComplete="name"
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  <label>
                    Category *
                    <select
                      value={promiseContext.noteCategory}
                      onChange={(event) =>
                        promiseContext.onNoteCategoryChange(
                          event.target.value as CollectionNoteCategory | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">Оберіть категорію…</option>
                      {NOTE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Body *
                    <textarea
                      value={promiseContext.noteBody}
                      onChange={(event) =>
                        promiseContext.onNoteBodyChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      required
                      rows={4}
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={promiseContext.notePinned}
                      onChange={(event) =>
                        promiseContext.onNotePinnedChange(event.target.checked)
                      }
                      disabled={promiseContext.busy}
                    />
                    Pin note
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.noteAuthor.trim() ||
                        !promiseContext.noteCategory ||
                        !promiseContext.noteBody.trim()
                      }
                    >
                      {promiseContext.busy
                        ? "Збереження…"
                        : promiseContext.notesEditId
                          ? "Update note"
                          : "Save note"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseNotesForm}
                    >
                      Скасувати
                    </button>
                  </div>
                </form>
              ) : null}

              {!promiseContext.formOpen &&
              !promiseContext.resolutionOpen &&
              !promiseContext.contactOpen &&
              !promiseContext.disputeOpen &&
              !promiseContext.escalationOpen &&
              !promiseContext.paymentPlanOpen &&
              !promiseContext.notesOpen ? (
                <div className="filter-actions">
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenContact}
                  >
                    Log contact
                  </button>
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenAddNote}
                  >
                    Add note
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
                  {isActiveEscalation(promiseContext.record?.escalation) ? (
                    <>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenEditEscalation}
                      >
                        Update escalation
                      </button>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenCompleteEscalation}
                      >
                        Complete escalation
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenEscalateCase}
                    >
                      Escalate case
                    </button>
                  )}
                  {isActivePaymentPlan(promiseContext.record?.paymentPlan) ? (
                    <>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenEditPaymentPlan}
                      >
                        Edit payment plan
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenCancelPaymentPlan}
                      >
                        Cancel payment plan
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenCreatePaymentPlan}
                    >
                      Create payment plan
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      closeDisabled ||
                      promiseContext.busy ||
                      isActivePaymentPlan(promiseContext.record?.paymentPlan)
                    }
                    onClick={promiseContext.onOpenForm}
                    title={
                      isActivePaymentPlan(promiseContext.record?.paymentPlan)
                        ? "Finish or cancel the active payment plan first"
                        : undefined
                    }
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
              {promiseContext.record ? (
                <div className="collection-notes-list">
                  {sortCollectionNotesForDisplay(promiseContext.record.notes)
                    .filter((note) => isActiveCollectionNote(note))
                    .map((note) => (
                      <article
                        key={note.id}
                        className={`collection-note-item${
                          note.pinned ? " collection-note-item--pinned" : ""
                        }`}
                      >
                        <div>
                          {note.category === "handoff" ? (
                            <span className="aging-badge aging-badge--note-handoff">
                              Handoff
                            </span>
                          ) : null}
                          <strong>{noteCategoryLabel(note.category)}</strong> · {note.author}
                          {note.pinned ? " · pinned" : ""}
                        </div>
                        <p>{note.body}</p>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onOpenEditNote(note.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onArchiveNote(note.id)}
                          >
                            Archive
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : null}
              <p className="meta promise-persistence-note">
                Contact, dispute, escalation, payment plan, internal notes, follow-up і resolution
                зберігаються локально в браузері (localStorage) за invoice id. Payment plan
                payments are operational tracking only.
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
                                : event.type === "case_escalated" ||
                                    event.type === "escalation_updated"
                                  ? `Due: ${event.followUpAt}`
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
                          {event.escalationReason ||
                          event.escalationTeam ||
                          event.escalationPriority ? (
                            <p className="meta">
                              {event.escalationPriority
                                ? escalationPriorityLabel(event.escalationPriority)
                                : "Escalation"}
                              {event.escalationReason
                                ? ` · ${escalationReasonLabel(event.escalationReason)}`
                                : ""}
                              {event.escalationTeam
                                ? ` · ${escalationTeamLabel(event.escalationTeam)}`
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
