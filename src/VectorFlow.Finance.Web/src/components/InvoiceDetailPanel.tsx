import type { Accrual, Invoice } from "../api";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
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
import { formatDate, formatMoney } from "../i18n/format";
import type {
  CollectionResolutionKind,
  CollectionNoteCategory,
  AttachmentCategory,
  EscalationStatus,
  PaymentPlanStatus,
  PromiseFollowUpStatus,
  PromiseToPayRecord,
  ReminderKind
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
  isActiveCollectionAttachment,
  isActivePaymentPlan,
  isOpenCollectionReminder,
  isReminderDueOrOverdue,
  listActiveCollectionNotes,
  listActiveCollectionAttachments,
  listOpenCollectionReminders,
  listOverdueInstallments,
  paymentPlanStatusLabel,
  planInstallmentRemaining,
  planPaidTotal,
  planRemainingTotal,
  noteCategoryLabel,
  attachmentCategoryLabel,
  formatAttachmentSize,
  promiseStatusLabel,
  reminderKindLabel,
  reminderStatusLabel,
  resolutionKindLabel,
  sortCollectionNotesForDisplay,
  sortCollectionRemindersForDisplay,
  sortCollectionAttachmentsForDisplay,
  NOTE_CATEGORY_OPTIONS,
  REMINDER_KIND_OPTIONS,
  ATTACHMENT_CATEGORY_OPTIONS,
  ATTACHMENT_MAX_BYTES,
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
  remindersOpen: boolean;
  remindersEditId: string;
  reminderTitle: string;
  reminderNote: string;
  reminderKind: ReminderKind | "";
  reminderDueDate: string;
  attachmentsOpen: boolean;
  attachmentsEditId: string;
  attachmentFileName: string;
  attachmentContentType: string;
  attachmentSizeBytes: number;
  attachmentCategory: AttachmentCategory | "";
  attachmentDescription: string;
  attachmentUploadedBy: string;
  attachmentHasNewFile: boolean;
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
  onOpenAddReminder: () => void;
  onOpenEditReminder: (reminderId: string) => void;
  onCloseRemindersForm: () => void;
  onReminderTitleChange: (value: string) => void;
  onReminderNoteChange: (value: string) => void;
  onReminderKindChange: (value: ReminderKind | "") => void;
  onReminderDueDateChange: (value: string) => void;
  onSaveReminder: () => void;
  onCompleteReminder: (reminderId: string) => void;
  onCancelReminder: (reminderId: string) => void;
  onOpenAddAttachment: () => void;
  onOpenEditAttachment: (attachmentId: string) => void;
  onCloseAttachmentsForm: () => void;
  onAttachmentFileSelected: (file: File | null) => void;
  onAttachmentCategoryChange: (value: AttachmentCategory | "") => void;
  onAttachmentDescriptionChange: (value: string) => void;
  onAttachmentUploadedByChange: (value: string) => void;
  onSaveAttachment: () => void;
  onArchiveAttachment: (attachmentId: string) => void;
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
  const { t } = useTranslation(["finance", "common"]);
  const statusLabel = (status: string) =>
    status === "Draft" || status === "Issued" ? t(`invoiceStatus.${status}`) : status;
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
        <h3 id="invoice-detail-heading">{t("invoices.detail.title")}</h3>
        <button
          type="button"
          className="button-secondary"
          onClick={onClose}
          disabled={closeDisabled}
        >
          {t("close", { ns: "common" })}
        </button>
      </div>

      {loading ? <StatusMessage>{t("detailLoading")}</StatusMessage> : null}

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

      {!loading && !error && fields && invoice ? (
        <>
          <p className="meta cell-wrap">{fields.documentNumber}</p>
          <dl className="facts">
            <div>
              <dt>{t("invoices.detail.field.status")}</dt>
              <dd>{statusLabel(fields.status)}</dd>
            </div>
            <div>
              <dt>{t("invoices.detail.field.counterparty")}</dt>
              <dd className="cell-wrap">{fields.counterpartyReference}</dd>
            </div>
            <div>
              <dt>{t("customerLedger.col.amount")}</dt>
              <dd>{fields.amountDisplay}</dd>
            </div>
            <div>
              <dt>{t("customerLedger.col.currency")}</dt>
              <dd>{fields.currency}</dd>
            </div>
            <div>
              <dt>{t("invoices.detail.field.dueDate")}</dt>
              <dd>{fields.dueDateDisplay}</dd>
            </div>
            <div>
              <dt>{t("invoices.col.issued")}</dt>
              <dd>{fields.issuedAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("field.created")}</dt>
              <dd>{fields.createdAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("field.updated")}</dt>
              <dd>{fields.updatedAtDisplay}</dd>
            </div>
            <div>
              <dt>{t("invoices.detail.field.id")}</dt>
              <dd className="mono">{fields.invoiceId}</dd>
            </div>
          </dl>

          <section
            className="due-date-aging-block"
            aria-labelledby="invoice-due-aging-heading"
          >
            <h4 id="invoice-due-aging-heading">{t("invoices.detail.agingTitle")}</h4>
            <dl className="facts">
              <div>
                <dt>{t("invoices.detail.field.dueDate")}</dt>
                <dd>{fields.dueDateDisplay}</dd>
              </div>
              <div>
                <dt>{t("invoices.detail.agingStatus")}</dt>
                <dd>
                  <span
                    className={`aging-badge aging-badge--${fields.dueDateAging.kind}`}
                  >
                    {fields.dueDateAging.label}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t("invoices.detail.agingDays")}</dt>
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
              <h4 id="invoice-collections-heading">{t("collections.contextTitle")}</h4>
              <dl className="facts">
                <div>
                  <dt>{t("collections.field.daysOverdue")}</dt>
                  <dd>
                    {collectionsContext.daysOverdue == null
                      ? t("collections.dueTodayOrNone")
                      : collectionsContext.daysOverdue}
                  </dd>
                </div>
                <div>
                  <dt>{t("customerLedger.agingBucketLabel")}</dt>
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
                  <dt>{t("invoices.detail.field.dueDate")}</dt>
                  <dd>{collectionsContext.dueDateDisplay}</dd>
                </div>
                <div>
                  <dt>{t("collections.field.invoiceAmount")}</dt>
                  <dd>{collectionsContext.amountDisplay}</dd>
                </div>
                <div>
                  <dt>{t("collections.field.counterparty")}</dt>
                  <dd className="cell-wrap">{collectionsContext.counterpartyReference}</dd>
                </div>
                <div>
                  <dt>{t("collections.field.invoiceStatus")}</dt>
                  <dd>{statusLabel(collectionsContext.status)}</dd>
                </div>
                <div>
                  <dt>{t("collections.field.queuePosition")}</dt>
                  <dd>{collectionsContext.positionLabel ?? "—"}</dd>
                </div>
              </dl>
              <div className="filter-actions">
                <button
                  type="button"
                  disabled={!collectionsContext.canGoNext || closeDisabled}
                  title={
                    collectionsContext.isLast
                      ? t("collections.nextTitleLast")
                      : t("collections.nextTitle")
                  }
                  onClick={collectionsContext.onNext}
                >
                  {t("collections.nextInvoice")}
                </button>
                {collectionsContext.isLast ? (
                  <p className="meta">{t("collections.lastInQueue")}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {promiseContext ? (
            <section
              className="promise-followup-block"
              aria-labelledby="invoice-promise-heading"
            >
              <h4 id="invoice-promise-heading">{t("promise.title")}</h4>
              {promiseContext.record ? (
                <dl className="facts">
                  <div>
                    <dt>{t("promise.col.promiseDate")}</dt>
                    <dd>{promiseContext.record.promiseDate}</dd>
                  </div>
                  <div>
                    <dt>{t("promise.col.followUpStatus")}</dt>
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
                      <dt>{t("promise.field.resolution")}</dt>
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
                      <dt>{t("promise.field.paymentDate")}</dt>
                      <dd>{promiseContext.record.resolution.paymentDate}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.paidAmount != null ? (
                    <div>
                      <dt>{t("promise.field.paidAmount")}</dt>
                      <dd>{promiseContext.record.resolution.paidAmount.toFixed(2)}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.remainingAmount != null ? (
                    <div>
                      <dt>{t("promise.field.remainingAmount")}</dt>
                      <dd>{promiseContext.record.resolution.remainingAmount.toFixed(2)}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.resolution?.reason ? (
                    <div>
                      <dt>{t("promise.field.reason")}</dt>
                      <dd className="cell-wrap">{promiseContext.record.resolution.reason}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.note ? (
                    <div>
                      <dt>{t("promise.col.note")}</dt>
                      <dd className="cell-wrap">{promiseContext.record.note}</dd>
                    </div>
                  ) : null}
                  <div className="collection-notes-list">
                    <dt>{t("promise.field.internalNotes")}</dt>
                    <dd>
                      {(() => {
                        const activeNotes = sortCollectionNotesForDisplay(
                          listActiveCollectionNotes(promiseContext.record.notes)
                        );
                        if (activeNotes.length === 0) {
                          return t("promise.noneActive");
                        }
                        return (
                          <>
                            <span>{t("promise.activeCount", { count: activeNotes.length })}</span>
                            {activeNotes.map((note) => (
                              <span
                                key={note.id}
                                className={`collection-note-item${
                                  note.pinned ? " collection-note-item--pinned" : ""
                                }`}
                              >
                                {note.category === "handoff" ? (
                                  <span className="aging-badge aging-badge--note-handoff">
                                    {t("promise.handoffBadge")}
                                  </span>
                                ) : null}
                                {note.pinned ? t("promise.pinnedPrefix") : ""}
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
                  <div className="collection-notes-list">
                    <dt>{t("promise.field.reminders")}</dt>
                    <dd>
                      {(() => {
                        const openReminders = sortCollectionRemindersForDisplay(
                          listOpenCollectionReminders(promiseContext.record.reminders)
                        );
                        if (openReminders.length === 0) {
                          return t("promise.noneOpen");
                        }
                        return (
                          <>
                            <span>{t("promise.openCount", { count: openReminders.length })}</span>
                            {openReminders.map((reminder) => (
                              <span
                                key={reminder.id}
                                className={`collection-note-item${
                                  isReminderDueOrOverdue(reminder)
                                    ? " collection-reminder-item--due"
                                    : ""
                                }`}
                              >
                                {isReminderDueOrOverdue(reminder) ? (
                                  <span className="aging-badge aging-badge--reminder-due">
                                    {t("promise.dueBadge")}
                                    </span>
                                ) : null}
                                {reminderKindLabel(reminder.kind)} ·{" "}
                                {t("promise.dueOn", { date: reminder.dueDate })} ·{" "}
                                {reminder.title}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </dd>
                  </div>
                  <div className="collection-notes-list">
                    <dt>{t("promise.field.evidence")}</dt>
                    <dd>
                      {(() => {
                        const activeAttachments = sortCollectionAttachmentsForDisplay(
                          listActiveCollectionAttachments(
                            promiseContext.record.attachments
                          )
                        );
                        if (activeAttachments.length === 0) {
                          return t("promise.noneActive");
                        }
                        return (
                          <>
                            <span>{t("promise.activeCount", { count: activeAttachments.length })}</span>
                            {activeAttachments.map((attachment) => (
                              <span
                                key={attachment.id}
                                className="collection-note-item collection-attachment-item"
                              >
                                <span className="aging-badge aging-badge--evidence">
                                  {attachmentCategoryLabel(attachment.category)}
                                </span>
                                {attachment.fileName} ·{" "}
                                {formatAttachmentSize(attachment.sizeBytes)}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </dd>
                  </div>
                  {promiseContext.record.nextFollowUpAt ? (
                    <div>
                      <dt>{t("promise.field.nextFollowUp")}</dt>
                      <dd>{promiseContext.record.nextFollowUpAt}</dd>
                    </div>
                  ) : null}
                  {promiseContext.record.lastContact ? (
                    <>
                      <div>
                        <dt>{t("promise.field.lastContact")}</dt>
                        <dd>
                          {contactChannelLabel(promiseContext.record.lastContact.channel)}
                          {" · "}
                          {contactResultLabel(promiseContext.record.lastContact.result)}
                        </dd>
                      </div>
                      {promiseContext.record.lastContact.note ? (
                        <div>
                          <dt>{t("promise.field.contactNote")}</dt>
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
                        <dt>{t("promise.field.dispute")}</dt>
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
                        <dt>{t("promise.field.disputeOwner")}</dt>
                        <dd>
                          {disputePartyLabel(promiseContext.record.dispute.responsibleParty)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("promise.field.disputeDescription")}</dt>
                        <dd className="cell-wrap">
                          {promiseContext.record.dispute.description}
                        </dd>
                      </div>
                      {promiseContext.record.dispute.nextReviewAt ? (
                        <div>
                          <dt>{t("promise.field.disputeReview")}</dt>
                          <dd>{promiseContext.record.dispute.nextReviewAt}</dd>
                        </div>
                      ) : null}
                      {promiseContext.record.dispute.resolutionComment ? (
                        <div>
                          <dt>{t("promise.field.disputeOutcome")}</dt>
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
                        <dt>{t("promise.field.escalation")}</dt>
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
                        <dt>{t("promise.field.responsibleTeam")}</dt>
                        <dd>
                          {escalationTeamLabel(
                            promiseContext.record.escalation.responsibleTeam
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("promise.field.requestedAction")}</dt>
                        <dd className="cell-wrap">
                          {promiseContext.record.escalation.requestedAction}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("promise.field.escalationDue")}</dt>
                        <dd>{promiseContext.record.escalation.dueDate}</dd>
                      </div>
                      <div>
                        <dt>{t("promise.field.escalationOpened")}</dt>
                        <dd>
                          {formatDate(promiseContext.record.escalation.openedAtUtc)}
                        </dd>
                      </div>
                      {promiseContext.record.escalation.completionComment ? (
                        <div>
                          <dt>{t("promise.field.escalationOutcome")}</dt>
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
                        <dt>{t("promise.field.paymentPlan")}</dt>
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
                            ? t("promise.overdueInstallmentSuffix")
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("promise.field.planAmount")}</dt>
                        <dd>
                          {formatMoney(
                            promiseContext.record.paymentPlan.planAmount,
                            promiseContext.record.paymentPlan.currency
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("promise.field.paidRemaining")}</dt>
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
                            return t("promise.paidCount", {
                              paid: counts.paid,
                              total: counts.total
                            });
                          })()}
                        </dd>
                      </div>
                      {(() => {
                        const next = selectNextInstallment(
                          promiseContext.record.paymentPlan
                        );
                        return next ? (
                          <div>
                            <dt>{t("promise.field.nextInstallment")}</dt>
                            <dd>
                              #{next.sequence} · {next.dueDate} ·{" "}
                              {formatMoney(
                                planInstallmentRemaining(next),
                                promiseContext.record.paymentPlan.currency
                              )}{" "}
                              {t("promise.installmentRemaining")}
                            </dd>
                          </div>
                        ) : null;
                      })()}
                      {listOverdueInstallments(promiseContext.record.paymentPlan).length >
                      0 ? (
                        <div>
                          <dt>{t("promise.field.overdueInstallments")}</dt>
                          <dd>
                            {listOverdueInstallments(promiseContext.record.paymentPlan)
                              .map((item) => `#${item.sequence}`)
                              .join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      {promiseContext.record.paymentPlan.cancellationReason ? (
                        <div>
                          <dt>{t("promise.field.cancellationReason")}</dt>
                          <dd className="cell-wrap">
                            {promiseContext.record.paymentPlan.cancellationReason}
                          </dd>
                        </div>
                      ) : null}
                      <div className="payment-plan-schedule">
                        <dt>{t("promise.field.schedule")}</dt>
                        <dd>
                          <table className="data-table payment-plan-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>{t("promise.plan.col.due")}</th>
                                <th>{t("promise.plan.col.expected")}</th>
                                <th>{t("promise.plan.col.recorded")}</th>
                                <th>{t("promise.plan.col.remaining")}</th>
                                <th>{t("promise.plan.col.status")}</th>
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
                                            {t("promise.recordPayment")}
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
                            {t("promise.trackingOnlyNote")}
                          </p>
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className="meta">{t("promise.notRecorded")}</p>
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
                    {t("promise.col.promiseDate")}
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
                    {t("promise.col.note")}
                    <input
                      value={promiseContext.note}
                      onChange={(event) => promiseContext.onNoteChange(event.target.value)}
                      placeholder={t("promise.notePlaceholder")}
                      autoComplete="off"
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <div className="filter-actions">
                    <button type="submit" disabled={promiseContext.busy || closeDisabled}>
                      {promiseContext.busy
                        ? t("saving", { ns: "common" })
                        : promiseContext.record
                          ? t("promise.updatePromiseAction")
                          : t("promise.savePromise")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseForm}
                    >
                      {t("promise.cancelAction")}
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
                  <h4 id="collection-resolution-heading">
                    {t("promise.resolutionTitle")}
                  </h4>
                  <label>
                    {t("promise.field.action")}
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
                      <option value="">{t("promise.selectResolution")}</option>
                      {RESOLUTION_KIND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {resolutionKindLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {promiseContext.resolutionKind === "paid" ||
                  promiseContext.resolutionKind === "partially_paid" ? (
                    <label>
                      {t("promise.field.paymentDate")}
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
                        {t("promise.field.paidAmount")}
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
                        {t("promise.field.remainingAmount")}
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
                      {t("promise.field.newPromiseDate")}
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
                        ? t("promise.field.disputeReason")
                        : t("promise.field.escalationReason")}
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
                      {t("promise.col.note")}
                      <input
                        value={promiseContext.resolutionNote}
                        onChange={(event) =>
                          promiseContext.onResolutionNoteChange(event.target.value)
                        }
                        placeholder={t("promise.notePlaceholder")}
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
                      {promiseContext.busy ? t("saving", { ns: "common" }) : t("promise.saveResolution")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseResolution}
                    >
                      {t("promise.cancelAction")}
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
                  <h4 id="collection-contact-heading">{t("promise.contactTitle")}</h4>
                  <label>
                    {t("promise.field.channel")}
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
                      <option value="">{t("promise.selectChannel")}</option>
                      {CONTACT_CHANNEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {contactChannelLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.result")}
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
                      <option value="">{t("promise.selectResult")}</option>
                      {CONTACT_RESULT_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {contactResultLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {promiseContext.contactResult === "payment_promised" ? (
                    <p className="meta">
                      {t("promise.paymentPromisedHint")}
                    </p>
                  ) : null}
                  <label>
                    {t("promise.col.note")}
                    <input
                      value={promiseContext.contactNote}
                      onChange={(event) =>
                        promiseContext.onContactNoteChange(event.target.value)
                      }
                      placeholder={t("promise.notePlaceholder")}
                      autoComplete="off"
                      disabled={promiseContext.busy}
                    />
                  </label>
                  <label>
                    {t("promise.field.nextFollowUp")}
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
                      {promiseContext.busy ? t("saving", { ns: "common" }) : t("promise.saveContact")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseContact}
                    >
                      {t("promise.cancelAction")}
                    </button>
                    {promiseContext.record?.nextFollowUpAt ? (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onClearFollowUp}
                      >
                        {t("promise.clearFollowUp")}
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
                    {promiseContext.disputeEditMode ? t("promise.updateDispute") : t("promise.raiseDispute")}
                  </h4>
                  <label>
                    {t("promise.field.reasonRequired")}
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
                      <option value="">{t("promise.selectReason")}</option>
                      {DISPUTE_REASON_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {disputeReasonLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.descriptionRequired")}
                    <input
                      value={promiseContext.disputeDescription}
                      onChange={(event) =>
                        promiseContext.onDisputeDescriptionChange(event.target.value)
                      }
                      placeholder={t("promise.disputeDescriptionPlaceholder")}
                      autoComplete="off"
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  <label>
                    {t("promise.field.responsiblePartyRequired")}
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
                      <option value="">{t("promise.selectParty")}</option>
                      {DISPUTE_PARTY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {disputePartyLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.nextReviewDate")}
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
                        ? t("saving", { ns: "common" })
                        : promiseContext.disputeEditMode
                          ? t("promise.saveDisputeUpdate")
                          : t("promise.saveDispute")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseDisputeForm}
                    >
                      {t("promise.cancelAction")}
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
                      ? t("promise.resolveDispute")
                      : t("promise.rejectDispute")}
                  </h4>
                  <label>
                    {t("promise.field.resolutionCommentRequired")}
                    <input
                      value={promiseContext.disputeCloseComment}
                      onChange={(event) =>
                        promiseContext.onDisputeCloseCommentChange(event.target.value)
                      }
                      placeholder={t("promise.commentPlaceholder")}
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
                        ? t("saving", { ns: "common" })
                        : promiseContext.disputeCloseMode === "resolve"
                          ? t("promise.resolveDispute")
                          : t("promise.rejectDispute")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseDisputeForm}
                    >
                      {t("promise.cancelAction")}
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
                      ? t("promise.updateEscalation")
                      : t("promise.escalateCase")}
                  </h4>
                  <label>
                    {t("promise.field.reasonRequired")}
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
                      <option value="">{t("promise.selectReason")}</option>
                      {ESCALATION_REASON_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {escalationReasonLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.priorityRequired")}
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
                      <option value="">{t("promise.selectPriority")}</option>
                      {ESCALATION_PRIORITY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {escalationPriorityLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.responsibleTeamRequired")}
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
                      <option value="">{t("promise.selectTeam")}</option>
                      {ESCALATION_TEAM_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {escalationTeamLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.requestedActionRequired")}
                    <textarea
                      value={promiseContext.escalationRequestedAction}
                      onChange={(event) =>
                        promiseContext.onEscalationRequestedActionChange(
                          event.target.value
                        )
                      }
                      placeholder={t("promise.requestedActionPlaceholder")}
                      disabled={promiseContext.busy}
                      required
                      rows={2}
                    />
                  </label>
                  <label>
                    {t("promise.field.dueDateRequired")}
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
                      {t("promise.col.note")}
                      <input
                        value={promiseContext.escalationNote}
                        onChange={(event) =>
                          promiseContext.onEscalationNoteChange(event.target.value)
                        }
                        placeholder={t("promise.optionalPlaceholder")}
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
                        ? t("saving", { ns: "common" })
                        : promiseContext.escalationEditMode
                          ? t("promise.saveEscalationUpdate")
                          : t("promise.saveEscalation")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseEscalationForm}
                    >
                      {t("promise.cancelAction")}
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
                    {t("promise.completeEscalation")}
                  </h4>
                  <label>
                    {t("promise.field.completionCommentRequired")}
                    <input
                      value={promiseContext.escalationCompleteComment}
                      onChange={(event) =>
                        promiseContext.onEscalationCompleteCommentChange(
                          event.target.value
                        )
                      }
                      placeholder={t("promise.commentPlaceholder")}
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
                      {promiseContext.busy ? t("saving", { ns: "common" }) : t("promise.completeEscalation")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseEscalationForm}
                    >
                      {t("promise.cancelAction")}
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
                      ? t("promise.editPaymentPlan")
                      : t("promise.createPaymentPlan")}
                  </h4>
                  <p className="meta">
                    {t("promise.paymentPlanNote")}
                  </p>
                  <label>
                    {t("promise.field.planAmountRequired")}
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
                      {t("promise.replacePromiseCheckbox")}
                    </label>
                  ) : null}
                  <div className="payment-plan-installment-editor">
                    <h5>{t("promise.installmentsTitle")}</h5>
                    {promiseContext.paymentPlanInstallments.map((row, index) => {
                      const locked =
                        promiseContext.paymentPlanEditMode &&
                        Number(row.recordedPaidAmount ?? 0) > 0;
                      return (
                        <div key={row.id ?? `new-${index}`} className="payment-plan-row">
                          <label>
                            {t("promise.field.dueDateRequired")}
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
                            {t("promise.field.amountRequired")}
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
                            <p className="meta">{t("promise.installmentLocked")}</p>
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
                              {t("promise.removeInstallment")}
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
                      {t("promise.addInstallment")}
                    </button>
                    <p className="meta">
                      {t("promise.installmentTotal")}{" "}
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
                        ? t("saving", { ns: "common" })
                        : promiseContext.paymentPlanEditMode
                          ? t("promise.savePaymentPlanUpdate")
                          : t("promise.savePaymentPlan")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onClosePaymentPlanForm}
                    >
                      {t("promise.cancelAction")}
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
                    {t("promise.cancelPaymentPlan")}
                  </h4>
                  <label>
                    {t("promise.field.cancellationReasonRequired")}
                    <input
                      value={promiseContext.paymentPlanCancelReason}
                      onChange={(event) =>
                        promiseContext.onPaymentPlanCancelReasonChange(event.target.value)
                      }
                      placeholder={t("promise.cancellationReasonPlaceholder")}
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
                      {promiseContext.busy ? t("saving", { ns: "common" }) : t("promise.cancelPaymentPlan")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onClosePaymentPlanForm}
                    >
                      {t("promise.cancelAction")}
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
                    {t("promise.recordPaymentTitle")}
                  </h4>
                  <p className="meta">
                    {t("promise.recordPaymentNote")}
                  </p>
                  <label>
                    {t("promise.field.amountRequired")}
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
                    {t("promise.col.note")}
                    <input
                      value={promiseContext.paymentPlanRecordNote}
                      onChange={(event) =>
                        promiseContext.onPaymentPlanRecordNoteChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      placeholder={t("promise.optionalPlaceholder")}
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
                        ? t("saving", { ns: "common" })
                        : t("promise.recordPaymentSubmit")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onClosePaymentPlanForm}
                    >
                      {t("promise.cancelAction")}
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
                    {promiseContext.notesEditId ? t("promise.updateNoteTitle") : t("promise.addNoteTitle")}
                  </h4>
                  <label>
                    {t("promise.field.authorRequired")}
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
                    {t("promise.field.categoryRequired")}
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
                      <option value="">{t("promise.selectCategory")}</option>
                      {NOTE_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {noteCategoryLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.bodyRequired")}
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
                    {t("promise.pinNote")}
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
                        ? t("saving", { ns: "common" })
                        : promiseContext.notesEditId
                          ? t("promise.updateNote")
                          : t("promise.saveNote")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseNotesForm}
                    >
                      {t("promise.cancelAction")}
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.remindersOpen ? (
                <form
                  className="filter-form collection-notes-form"
                  aria-labelledby="collection-reminders-heading"
                  onSubmit={(event) => {
                    event.preventDefault();
                    promiseContext.onSaveReminder();
                  }}
                >
                  <h4 id="collection-reminders-heading">
                    {promiseContext.remindersEditId
                      ? t("promise.rescheduleReminderTitle")
                      : t("promise.scheduleReminderTitle")}
                  </h4>
                  <label>
                    {t("promise.field.titleRequired")}
                    <input
                      value={promiseContext.reminderTitle}
                      onChange={(event) =>
                        promiseContext.onReminderTitleChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  <label>
                    {t("promise.field.typeRequired")}
                    <select
                      value={promiseContext.reminderKind}
                      onChange={(event) =>
                        promiseContext.onReminderKindChange(
                          event.target.value as ReminderKind | ""
                        )
                      }
                      disabled={promiseContext.busy}
                      required
                    >
                      <option value="">{t("promise.selectType")}</option>
                      {REMINDER_KIND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {reminderKindLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.dueDateRequired")}
                    <input
                      type="date"
                      value={promiseContext.reminderDueDate}
                      onChange={(event) =>
                        promiseContext.onReminderDueDateChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      required
                    />
                  </label>
                  <label>
                    {t("promise.col.note")}
                    <textarea
                      value={promiseContext.reminderNote}
                      onChange={(event) =>
                        promiseContext.onReminderNoteChange(event.target.value)
                      }
                      disabled={promiseContext.busy}
                      rows={3}
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.reminderTitle.trim() ||
                        !promiseContext.reminderKind ||
                        !promiseContext.reminderDueDate.trim()
                      }
                    >
                      {promiseContext.busy
                        ? t("saving", { ns: "common" })
                        : promiseContext.remindersEditId
                          ? t("promise.updateReminder")
                          : t("promise.saveReminder")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseRemindersForm}
                    >
                      {t("promise.cancelAction")}
                    </button>
                  </div>
                </form>
              ) : null}

              {promiseContext.attachmentsOpen ? (
                <form
                  className="stack-form"
                  aria-labelledby="collection-attachments-heading"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    promiseContext.onSaveAttachment();
                  }}
                >
                  <h4 id="collection-attachments-heading">
                    {promiseContext.attachmentsEditId
                      ? t("promise.editAttachmentTitle")
                      : t("promise.addEvidenceTitle")}
                  </h4>
                  <label>
                    {t("promise.field.file")}
                    <input
                      type="file"
                      disabled={promiseContext.busy || closeDisabled}
                      onChange={(event) =>
                        promiseContext.onAttachmentFileSelected(
                          event.target.files?.[0] ?? null
                        )
                      }
                    />
                  </label>
                  {promiseContext.attachmentFileName ? (
                    <p className="meta">
                      {promiseContext.attachmentFileName}
                      {promiseContext.attachmentContentType
                        ? ` · ${promiseContext.attachmentContentType}`
                        : ""}
                      {promiseContext.attachmentSizeBytes
                        ? ` · ${formatAttachmentSize(promiseContext.attachmentSizeBytes)}`
                        : ""}
                      {promiseContext.attachmentsEditId &&
                      !promiseContext.attachmentHasNewFile
                        ? t("promise.existingFileRetained")
                        : ""}
                    </p>
                  ) : (
                    <p className="meta">
                      Max {formatAttachmentSize(ATTACHMENT_MAX_BYTES)}.
                      {promiseContext.attachmentsEditId
                        ? t("promise.keepCurrentFile")
                        : ""}
                    </p>
                  )}
                  <label>
                    {t("promise.field.category")}
                    <select
                      value={promiseContext.attachmentCategory}
                      disabled={promiseContext.busy || closeDisabled}
                      onChange={(event) =>
                        promiseContext.onAttachmentCategoryChange(
                          event.target.value as AttachmentCategory | ""
                        )
                      }
                    >
                      <option value="">{t("promise.selectCategoryPlain")}</option>
                      {ATTACHMENT_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {attachmentCategoryLabel(option.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("promise.field.uploadedBy")}
                    <input
                      type="text"
                      value={promiseContext.attachmentUploadedBy}
                      disabled={promiseContext.busy || closeDisabled}
                      onChange={(event) =>
                        promiseContext.onAttachmentUploadedByChange(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    {t("invoices.detail.col.description")}
                    <textarea
                      rows={3}
                      value={promiseContext.attachmentDescription}
                      disabled={promiseContext.busy || closeDisabled}
                      onChange={(event) =>
                        promiseContext.onAttachmentDescriptionChange(event.target.value)
                      }
                    />
                  </label>
                  <div className="filter-actions">
                    <button
                      type="submit"
                      disabled={
                        promiseContext.busy ||
                        closeDisabled ||
                        !promiseContext.attachmentCategory ||
                        !promiseContext.attachmentUploadedBy.trim() ||
                        (!promiseContext.attachmentsEditId &&
                          !promiseContext.attachmentHasNewFile) ||
                        (promiseContext.attachmentsEditId
                          ? !promiseContext.attachmentFileName.trim()
                          : !promiseContext.attachmentFileName.trim())
                      }
                    >
                      {promiseContext.busy
                        ? t("saving", { ns: "common" })
                        : promiseContext.attachmentsEditId
                          ? t("promise.updateAttachment")
                          : t("promise.saveAttachment")}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={promiseContext.busy || closeDisabled}
                      onClick={promiseContext.onCloseAttachmentsForm}
                    >
                      {t("promise.cancelAction")}
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
              !promiseContext.notesOpen &&
              !promiseContext.remindersOpen &&
              !promiseContext.attachmentsOpen ? (
                <div className="filter-actions">
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenContact}
                  >
                    {t("promise.contactTitle")}
                  </button>
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenAddNote}
                  >
                    {t("promise.addNote")}
                  </button>
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenAddReminder}
                  >
                    {t("promise.scheduleReminderTitle")}
                  </button>
                  <button
                    type="button"
                    disabled={closeDisabled || promiseContext.busy}
                    onClick={promiseContext.onOpenAddAttachment}
                  >
                    {t("promise.addEvidence")}
                  </button>
                  {isActiveDispute(promiseContext.record?.dispute) ? (
                    <>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenEditDispute}
                      >
                        {t("promise.updateDispute")}
                      </button>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenResolveDispute}
                      >
                        {t("promise.resolveDispute")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenRejectDispute}
                      >
                        {t("promise.rejectDispute")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenRaiseDispute}
                    >
                      {t("promise.raiseDispute")}
                    </button>
                  )}
                  {isActiveEscalation(promiseContext.record?.escalation) ? (
                    <>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenEditEscalation}
                      >
                        {t("promise.updateEscalation")}
                      </button>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenCompleteEscalation}
                      >
                        {t("promise.completeEscalation")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenEscalateCase}
                    >
                      {t("promise.escalateCase")}
                    </button>
                  )}
                  {isActivePaymentPlan(promiseContext.record?.paymentPlan) ? (
                    <>
                      <button
                        type="button"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenEditPaymentPlan}
                      >
                        {t("promise.editPaymentPlan")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={closeDisabled || promiseContext.busy}
                        onClick={promiseContext.onOpenCancelPaymentPlan}
                      >
                        {t("promise.cancelPaymentPlan")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenCreatePaymentPlan}
                    >
                      {t("promise.createPaymentPlan")}
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
                        ? t("promise.activePlanTitle")
                        : undefined
                    }
                  >
                    {promiseContext.record ? t("promise.updatePromiseAction") : t("promise.title")}
                  </button>
                  {promiseContext.record ? (
                    <button
                      type="button"
                      disabled={closeDisabled || promiseContext.busy}
                      onClick={promiseContext.onOpenResolution}
                    >
                      {t("promise.resolveCollection")}
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
                        {t("promise.markFollowUpRequired")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onMarkContacted}
                      >
                        {t("promise.markContacted")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={promiseContext.busy || closeDisabled}
                        onClick={promiseContext.onComplete}
                      >
                        {t("promise.completeFollowUp")}
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
                      {t("promise.reopenFollowUp")}
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
                              {t("promise.handoffBadge")}
                            </span>
                          ) : null}
                          <strong>{noteCategoryLabel(note.category)}</strong> · {note.author}
                          {note.pinned ? t("promise.pinnedSuffix") : ""}
                        </div>
                        <p>{note.body}</p>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onOpenEditNote(note.id)}
                          >
                            {t("invoices.detail.editLine")}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onArchiveNote(note.id)}
                          >
                            {t("promise.archiveAction")}
                          </button>
                        </div>
                      </article>
                    ))}
                  {sortCollectionRemindersForDisplay(promiseContext.record.reminders)
                    .filter((reminder) => isOpenCollectionReminder(reminder))
                    .map((reminder) => (
                      <article
                        key={reminder.id}
                        className={`collection-note-item${
                          isReminderDueOrOverdue(reminder)
                            ? " collection-reminder-item--due"
                            : ""
                        }`}
                      >
                        <div>
                          {isReminderDueOrOverdue(reminder) ? (
                            <span className="aging-badge aging-badge--reminder-due">
                              {t("promise.dueBadge")}
                              </span>
                          ) : null}
                          <strong>{reminderKindLabel(reminder.kind)}</strong> · due{" "}
                          {reminder.dueDate} · {reminderStatusLabel(reminder.status)}
                        </div>
                        <p>
                          <strong>{reminder.title}</strong>
                          {reminder.note ? `\n${reminder.note}` : ""}
                        </p>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onOpenEditReminder(reminder.id)}
                          >
                            {t("promise.rescheduleAction")}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onCompleteReminder(reminder.id)}
                          >
                            {t("promise.completeAction")}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() => promiseContext.onCancelReminder(reminder.id)}
                          >
                            {t("promise.cancelAction")}
                          </button>
                        </div>
                      </article>
                    ))}
                  {sortCollectionAttachmentsForDisplay(promiseContext.record.attachments)
                    .filter((attachment) => isActiveCollectionAttachment(attachment))
                    .map((attachment) => (
                      <article
                        key={attachment.id}
                        className="collection-note-item collection-attachment-item"
                      >
                        <div>
                          <span className="aging-badge aging-badge--evidence">
                            {attachmentCategoryLabel(attachment.category)}
                          </span>
                          <strong>{attachment.fileName}</strong> ·{" "}
                          {formatAttachmentSize(attachment.sizeBytes)} ·{" "}
                          {attachment.uploadedBy}
                        </div>
                        {attachment.description ? <p>{attachment.description}</p> : null}
                        <div className="row-actions">
                          <a
                            className="button-secondary"
                            href={attachment.contentDataUrl}
                            download={attachment.fileName}
                          >
                            {t("promise.downloadAction")}
                          </a>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() =>
                              promiseContext.onOpenEditAttachment(attachment.id)
                            }
                          >
                            {t("invoices.detail.editLine")}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={closeDisabled || promiseContext.busy}
                            onClick={() =>
                              promiseContext.onArchiveAttachment(attachment.id)
                            }
                          >
                            {t("promise.archiveAction")}
                          </button>
                        </div>
                      </article>
                    ))}
                </div>
              ) : null}
              <p className="meta promise-persistence-note">
                {t("promise.persistenceNote")}
              </p>
            </section>
          ) : null}

          {historyContext ? (
            <section
              className="case-history-block"
              aria-labelledby="case-history-heading"
            >
              <div className="filter-actions">
                <h4 id="case-history-heading">{t("promise.history.title")}</h4>
                {!historyContext.open ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={closeDisabled}
                    onClick={historyContext.onOpen}
                  >
                    {t("promise.history.open")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={closeDisabled}
                    onClick={historyContext.onClose}
                  >
                    {t("promise.history.close")}
                  </button>
                )}
              </div>

              {historyContext.open && historyContext.view ? (
                <>
                  <dl className="collections-summary facts collections-kpi case-history-summary">
                    <div>
                      <dt>{t("promise.history.currentStatus")}</dt>
                      <dd>{historyContext.view.summary.currentStatus}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.history.currentPromise")}</dt>
                      <dd>{historyContext.view.summary.currentPromise ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.history.lastContact")}</dt>
                      <dd>
                        {formatDate(historyContext.view.summary.lastContactAtUtc)}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("promise.history.lastResolution")}</dt>
                      <dd>{historyContext.view.summary.lastResolutionLabel ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.history.totalFollowUps")}</dt>
                      <dd>{historyContext.view.summary.totalFollowUps}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.history.totalPromises")}</dt>
                      <dd>{historyContext.view.summary.totalPromises}</dd>
                    </div>
                  </dl>

                  <form
                    className="filter-form promise-search-form"
                    onSubmit={historyContext.onSearchSubmit}
                  >
                    <label>
                      {t("promise.history.searchLabel")}
                      <input
                        value={historyContext.searchDraft}
                        onChange={(event) =>
                          historyContext.onSearchDraftChange(event.target.value)
                        }
                        placeholder={t("promise.history.searchPlaceholder")}
                        autoComplete="off"
                      />
                    </label>
                    <label>
                      {t("promise.history.typeLabel")}
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
                            {option.id
                              ? activityEventTypeLabel(option.id)
                              : t("promise.history.allEvents")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="filter-actions">
                      <button type="submit">{t("invoices.findAction")}</button>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={historyContext.onToggleExpanded}
                      >
                        {historyContext.view.collapsed
                          ? t("promise.history.expand")
                          : t("promise.history.collapse")}
                      </button>
                    </div>
                  </form>

                  <p className="meta">
                    Activity timeline · {historyContext.view.visibleCount} /{" "}
                    {historyContext.view.totalCount}
                    {historyContext.view.collapsed ? t("promise.history.collapsedSuffix") : ""}
                  </p>

                  {historyContext.view.events.length === 0 ? (
                    <p className="meta">{t("promise.history.empty")}</p>
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
                            <p className="meta cell-wrap">
                              {t("promise.history.notePrefix", { note: event.note })}
                            </p>
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
                                ? t("promise.history.reviewOn", { date: event.followUpAt })
                                : event.type === "case_escalated" ||
                                    event.type === "escalation_updated"
                                  ? t("promise.history.dueOn", { date: event.followUpAt })
                                  : t("promise.history.followUpOn", { date: event.followUpAt })}
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
              <p className="meta">{t("invoices.detail.linesTitle")}</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("invoices.detail.col.description")}</th>
                    <th>{t("invoices.detail.col.quantity")}</th>
                    <th>{t("invoices.detail.col.price")}</th>
                    <th>{t("invoices.detail.col.amount")}</th>
                    {showLineManage ? <th>{t("invoices.detail.col.action")}</th> : null}
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
                              {lineUpdateBusy ? t("saving", { ns: "common" }) : t("invoices.detail.editLine")}
                            </button>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={actionsDisabled}
                              onClick={() => onRemoveLine?.(invoice, line.id)}
                            >
                              {lineRemoveBusy ? t("invoices.removing") : t("remove", { ns: "common" })}
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
            <p className="meta">{t("invoices.detail.linesEmpty")}</p>
          )}

          <div className="table-wrap" aria-labelledby="invoice-related-accruals-heading">
            <p className="meta" id="invoice-related-accruals-heading">
              {t("invoices.detail.relatedAccruals")}
            </p>
            {relatedAccrualsLoading ? (
              <StatusMessage>{t("invoices.detail.relatedAccrualsLoading")}</StatusMessage>
            ) : null}
            {!relatedAccrualsLoading && relatedAccrualsError ? (
              <div className="state-actions" role="alert">
                <StatusMessage tone="error">{relatedAccrualsError}</StatusMessage>
                {onRetryRelatedAccruals ? (
                  <button type="button" onClick={onRetryRelatedAccruals}>
                    {t("retry", { ns: "common" })}
                  </button>
                ) : null}
              </div>
            ) : null}
            {!relatedAccrualsLoading && !relatedAccrualsError && relatedRows.length === 0 ? (
              <p className="meta">{t("invoices.detail.relatedAccrualsEmpty")}</p>
            ) : null}
            {!relatedAccrualsLoading && !relatedAccrualsError && relatedRows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>{t("invoices.detail.accrualCol.description")}</th>
                    <th>{t("invoices.detail.accrualCol.status")}</th>
                    <th>{t("invoices.detail.accrualCol.amount")}</th>
                    <th>{t("invoices.detail.accrualCol.recognitionDate")}</th>
                    {onOpenAccrual ? <th>{t("invoices.detail.accrualCol.action")}</th> : null}
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
                            {t("invoices.openAction")}
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
              <p className="meta">{t("invoices.detail.actionsTitle")}</p>
              {showEditHeader ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onEditHeader?.(invoice)}
                >
                  {headerEditBusy ? t("saving", { ns: "common" }) : t("invoices.editHeader")}
                </button>
              ) : null}
              {showAddLine ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onAddLine?.(invoice)}
                >
                  {lineAddBusy ? t("saving", { ns: "common" }) : t("invoices.addLine")}
                </button>
              ) : null}
              {showEditDueDate ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onEditDueDate?.(invoice)}
                >
                  {dueDateEditBusy ? t("saving", { ns: "common" }) : t("invoices.changeDueDate")}
                </button>
              ) : null}
              {showIssue ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onIssue?.(invoice)}
                >
                  {issueBusy ? t("invoices.issuing") : t("invoices.issue")}
                </button>
              ) : null}
              {showCreateAccrual ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={actionsDisabled}
                  onClick={() => onCreateAccrual?.(invoice)}
                >
                  {createAccrualBusy ? t("creating", { ns: "common" }) : t("invoices.createAccrual")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
