import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addInvoiceLine,
  changeInvoiceCounterparty,
  changeInvoiceCurrency,
  changeInvoiceDocumentNumber,
  createAccrual,
  createInvoice,
  getInvoice,
  issueInvoice,
  listAccrualsByInvoice,
  listInvoicesPaged,
  removeInvoiceLine,
  setInvoiceDueDate,
  updateInvoiceLine,
  type Accrual,
  type FinanceWorkspace,
  type Invoice,
  type InvoiceLine
} from "./api";
import {
  EMPTY_INVOICE_FILTERS,
  draftInvoicesDiscovery,
  issuedInvoicesDiscovery,
  isPromisePanel,
  overdueIssuedInvoicesDiscovery,
  type CollectionPanelMode
} from "./urlState";
import {
  INVOICE_PAGE_SIZE,
  INVOICE_STATUS_OPTIONS,
  buildInvoiceListQuery,
  hasActiveInvoiceDiscovery,
  isOverdueInvoiceQueue,
  totalPages,
  type InvoiceListFilters,
  type InvoiceQueueMode,
  type InvoiceStatusFilter
} from "./invoiceListQuery";
import {
  classifyDueDateAging,
  collectionsQueueDueToDateInput
} from "./invoiceDueDateAging";
import {
  AGING_BUCKET_OPTIONS,
  COLLECTIONS_PAGE_SIZE,
  agingBucketForInvoice,
  agingBucketLabel,
  agingBucketShortKey,
  buildCollectionsQueue,
  collectionsQueuePosition,
  overdueDaysForInvoice,
  type AgingBucketFilter
} from "./invoiceCollections";
import {
  buildSettlementAwareCollectionsSummary,
  filterCollectionsQueueBySettlement,
  recordsByInvoiceId,
  resolveCollectionQueueSettlement
} from "./collectionQueueSettlement";
import {
  PROMISE_GROUP_OPTIONS,
  applyCollectionResolution,
  addCollectionNote,
  archiveCollectionNote,
  buildPromiseFollowUpItems,
  buildPromiseFollowUpSummary,
  cancelCollectionReminder,
  completeCollectionReminder,
  createCollectionReminder,
  addCollectionAttachment,
  archiveCollectionAttachment,
  updateCollectionAttachment,
  readLastCollectionAttachmentAuthor,
  ATTACHMENT_MAX_BYTES,
  NOTE_CATEGORY_OPTIONS,
  filterPromiseFollowUps,
  groupPromiseFollowUps,
  listPromiseRecordsFromStorage,
  raiseCollectionDispute,
  raiseCollectionEscalation,
  readPromiseFromStorage,
  rejectCollectionDispute,
  resolveCollectionDispute,
  completeCollectionEscalation,
  createPaymentPlan,
  cancelPaymentPlan,
  emptyInstallmentDraft,
  recordInstallmentPayment,
  readLastCollectionNoteAuthor,
  promiseGroupKey,
  promiseGroupShortKey,
  promiseStatusLabel,
  resolutionKindLabel,
  saveCollectionContact,
  savePromiseToPay,
  updateCollectionDispute,
  updateCollectionEscalation,
  updateCollectionNote,
  updateCollectionReminder,
  updateContactFollowUp,
  updatePaymentPlan,
  updatePromiseStatus,
  type AttachmentCategory,
  type CollectionNoteCategory,
  type CollectionResolutionKind,
  type PromiseFollowUpItem,
  type PromiseGroupFilter,
  type PromiseToPayRecord,
  type ReminderKind
} from "./promiseToPay";
import type { PaymentPlanInstallmentInput } from "./paymentPlan";
import {
  WORKBENCH_SECTION_OPTIONS,
  WORKBENCH_SORT_OPTIONS,
  applyWorkbenchMassAction,
  buildWorkbenchCases,
  buildWorkbenchKpi,
  buildWorkbenchSectionSummaries,
  filterWorkbenchCases,
  workbenchSectionKey,
  workbenchSectionShortKey,
  workbenchSortKey,
  type WorkbenchMassActionId,
  type WorkbenchSectionFilter,
  type WorkbenchSortMode
} from "./collectionWorkbench";
import {
  buildCaseHistoryView,
  disputePartyLabel,
  disputeReasonLabel,
  escalationPriorityLabel,
  escalationReasonLabel,
  escalationTeamLabel,
  type CollectionActivityEventTypeFilter,
  type ContactChannel,
  type ContactResult,
  type DisputeParty,
  type DisputeReason,
  type EscalationPriority,
  type EscalationReason,
  type EscalationTeam
} from "./collectionCaseHistory";
import {
  canViewInvoiceDetails,
  DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE,
  interpretInvoiceDetailLoadError,
  shouldReloadDetailAfterMutation,
  type BeginEditorOptions
} from "./invoiceDetail";
import {
  applyDraftInvoiceDueDateChange,
  canEditDraftInvoiceDueDate,
  initialDueDateInputValue,
  interpretDraftInvoiceDueDateEditError
} from "./draftInvoiceDueDateEditor";
import {
  applyDraftInvoiceHeaderEditorChanges,
  canEditDraftInvoiceHeader,
  interpretDraftInvoiceHeaderEditorError,
  valuesFromInvoice,
  type DraftInvoiceHeaderEditorValues
} from "./draftInvoiceHeaderEditor";
import {
  applyCreateAccrualFromInvoice,
  canCreateAccrualFromInvoice,
  initialCreateAccrualFromInvoiceValues,
  interpretCreateAccrualFromInvoiceError,
  interpretRelatedAccrualsLoadError,
  shouldReloadRelatedAccrualsAfterCreate,
  validateCreateAccrualFromInvoiceValues,
  type CreateAccrualFromInvoiceValues
} from "./invoiceAccrualBridge";
import {
  applyDraftInvoiceLineAdd,
  canAddDraftInvoiceLine,
  initialDraftInvoiceLineAddInput,
  interpretDraftInvoiceLineAddError
} from "./draftInvoiceLineAddEditor";
import {
  applyDraftInvoiceLineUpdate,
  canUpdateDraftInvoiceLine,
  findInvoiceLine,
  initialDraftInvoiceLineUpdateInput,
  interpretDraftInvoiceLineUpdateError
} from "./draftInvoiceLineUpdateEditor";
import {
  applyDraftInvoiceLineRemove,
  canRemoveDraftInvoiceLine,
  draftInvoiceLineConfirmationLabel,
  interpretDraftInvoiceLineRemoveError
} from "./draftInvoiceLineRemoveEditor";
import {
  defaultDueDateInputValue,
  getInvoiceIssueReadiness,
  interpretInvoiceIssueError,
  isDraftInvoice,
  toDueDateUtcIso
} from "./invoiceIssue";

type DraftInvoiceLineEditorTarget = {
  invoice: Invoice;
  lineId: string;
  line: InvoiceLine;
};
import { CreateAccrualFromInvoiceEditor } from "./components/CreateAccrualFromInvoiceEditor";
import { DraftInvoiceHeaderEditor } from "./components/DraftInvoiceHeaderEditor";
import { InvoiceDetailPanel } from "./components/InvoiceDetailPanel";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import { formatDate, formatMoney } from "./i18n/format";

type InvoiceIdChangeOptions = {
  replace?: boolean;
};

type InvoicesViewProps = {
  workspace: FinanceWorkspace | null;
  initialPage?: number;
  initialFilters?: InvoiceListFilters;
  initialInvoiceQueue?: InvoiceQueueMode;
  initialAgingBucket?: AgingBucketFilter;
  initialCollectionPanel?: CollectionPanelMode;
  initialPromiseGroup?: PromiseGroupFilter;
  initialPromiseSearch?: string;
  initialWorkbenchSection?: WorkbenchSectionFilter;
  initialWorkbenchSort?: WorkbenchSortMode;
  initialWorkbenchHideCompleted?: boolean;
  initialQueueHideSettled?: boolean;
  initialCaseHistoryOpen?: boolean;
  initialCaseHistoryType?: CollectionActivityEventTypeFilter;
  initialCaseHistorySearch?: string;
  initialCaseHistoryExpanded?: boolean;
  selectedInvoiceId?: string | null;
  onDiscoveryChange?: (
    page: number,
    filters: InvoiceListFilters,
    invoiceQueue?: InvoiceQueueMode,
    agingBucket?: AgingBucketFilter,
    collectionPanel?: CollectionPanelMode,
    promiseGroup?: PromiseGroupFilter,
    promiseSearch?: string,
    workbenchSort?: WorkbenchSortMode,
    workbenchHideCompleted?: boolean,
    workbenchSection?: WorkbenchSectionFilter,
    caseHistoryOpen?: boolean,
    caseHistoryType?: CollectionActivityEventTypeFilter,
    caseHistorySearch?: string,
    caseHistoryExpanded?: boolean,
    queueHideSettled?: boolean
  ) => void;
  onSelectedInvoiceIdChange?: (
    invoiceId: string | null,
    options?: InvoiceIdChangeOptions
  ) => void;
  onShowDraftInvoices?: () => void;
  onShowIssuedInvoices?: () => void;
  onShowOverdueIssuedInvoices?: () => void;
  /** Cross-view handoff: open Accruals detail for a created/related accrual. */
  onOpenAccrual?: (accrualId: string) => void;
};

const emptyFilters: InvoiceListFilters = { ...EMPTY_INVOICE_FILTERS };

function buildDemoDocumentNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  return `INV-${stamp}`;
}

export function InvoicesView({
  workspace,
  initialPage = 1,
  initialFilters = emptyFilters,
  initialInvoiceQueue = "",
  initialAgingBucket = "",
  initialCollectionPanel = "",
  initialPromiseGroup = "",
  initialPromiseSearch = "",
  initialWorkbenchSection = "",
  initialWorkbenchSort = "priority",
  initialWorkbenchHideCompleted = false,
  initialQueueHideSettled = true,
  initialCaseHistoryOpen = false,
  initialCaseHistoryType = "",
  initialCaseHistorySearch = "",
  initialCaseHistoryExpanded = false,
  selectedInvoiceId = null,
  onDiscoveryChange,
  onSelectedInvoiceIdChange,
  onShowDraftInvoices,
  onShowIssuedInvoices,
  onShowOverdueIssuedInvoices,
  onOpenAccrual
}: InvoicesViewProps) {
  const { t } = useTranslation(["finance", "common"]);
  const statusLabel = useCallback(
    (status: string) => {
      if (status === "Draft" || status === "Issued") {
        return t(`invoiceStatus.${status}`);
      }
      return status;
    },
    [t]
  );
  const [draftFilters, setDraftFilters] = useState<InvoiceListFilters>(() => ({
    ...emptyFilters,
    ...initialFilters
  }));
  const [appliedFilters, setAppliedFilters] = useState<InvoiceListFilters>(() => ({
    ...emptyFilters,
    ...initialFilters
  }));
  const [invoiceQueue, setInvoiceQueue] = useState<InvoiceQueueMode>(
    () => initialInvoiceQueue
  );
  const [agingBucket, setAgingBucket] = useState<AgingBucketFilter>(
    () => (initialInvoiceQueue === "overdue" ? initialAgingBucket : "")
  );
  const [collectionPanel, setCollectionPanel] = useState<CollectionPanelMode>(() =>
    initialInvoiceQueue === "overdue" && isPromisePanel(initialCollectionPanel)
      ? initialCollectionPanel
      : ""
  );
  const [promiseGroup, setPromiseGroup] = useState<PromiseGroupFilter>(() =>
    initialInvoiceQueue === "overdue" && isPromisePanel(initialCollectionPanel)
      ? initialPromiseGroup
      : ""
  );
  const [promiseSearch, setPromiseSearch] = useState(() =>
    initialInvoiceQueue === "overdue" && isPromisePanel(initialCollectionPanel)
      ? initialPromiseSearch
      : ""
  );
  const [promiseSearchDraft, setPromiseSearchDraft] = useState(() =>
    initialInvoiceQueue === "overdue" && isPromisePanel(initialCollectionPanel)
      ? initialPromiseSearch
      : ""
  );
  const [workbenchSection, setWorkbenchSection] = useState<WorkbenchSectionFilter>(() =>
    initialInvoiceQueue === "overdue" && initialCollectionPanel === "workbench"
      ? initialWorkbenchSection
      : ""
  );
  const [workbenchSort, setWorkbenchSort] = useState<WorkbenchSortMode>(() =>
    initialInvoiceQueue === "overdue" && initialCollectionPanel === "workbench"
      ? initialWorkbenchSort
      : "priority"
  );
  const [workbenchHideCompleted, setWorkbenchHideCompleted] = useState(() =>
    initialInvoiceQueue === "overdue" && initialCollectionPanel === "workbench"
      ? initialWorkbenchHideCompleted
      : false
  );
  const [queueHideSettled, setQueueHideSettled] = useState(() =>
    initialInvoiceQueue === "overdue" ? initialQueueHideSettled : true
  );
  const [workbenchSelectedIds, setWorkbenchSelectedIds] = useState<string[]>([]);
  const [workbenchMassMessage, setWorkbenchMassMessage] = useState<string | null>(null);
  const [caseHistoryOpen, setCaseHistoryOpen] = useState(
    () => initialInvoiceQueue === "overdue" && initialCaseHistoryOpen
  );
  const [caseHistoryType, setCaseHistoryType] = useState<CollectionActivityEventTypeFilter>(
    () =>
      initialInvoiceQueue === "overdue" && initialCaseHistoryOpen ? initialCaseHistoryType : ""
  );
  const [caseHistorySearch, setCaseHistorySearch] = useState(() =>
    initialInvoiceQueue === "overdue" && initialCaseHistoryOpen
      ? initialCaseHistorySearch
      : ""
  );
  const [caseHistorySearchDraft, setCaseHistorySearchDraft] = useState(() =>
    initialInvoiceQueue === "overdue" && initialCaseHistoryOpen
      ? initialCaseHistorySearch
      : ""
  );
  const [caseHistoryExpanded, setCaseHistoryExpanded] = useState(
    () =>
      initialInvoiceQueue === "overdue" &&
      initialCaseHistoryOpen &&
      initialCaseHistoryExpanded
  );
  const [promiseRevision, setPromiseRevision] = useState(0);
  const [promiseFormOpen, setPromiseFormOpen] = useState(false);
  const [promiseDateInput, setPromiseDateInput] = useState("");
  const [promiseNoteInput, setPromiseNoteInput] = useState("");
  const [promiseFormError, setPromiseFormError] = useState<string | null>(null);
  const [promiseFormSuccess, setPromiseFormSuccess] = useState<string | null>(null);
  const [promiseBusy, setPromiseBusy] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [resolutionKind, setResolutionKind] = useState<CollectionResolutionKind | "">("");
  const [resolutionPaymentDate, setResolutionPaymentDate] = useState("");
  const [resolutionPaidAmount, setResolutionPaidAmount] = useState("");
  const [resolutionRemainingAmount, setResolutionRemainingAmount] = useState("");
  const [resolutionPromiseDate, setResolutionPromiseDate] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [contactOpen, setContactOpen] = useState(false);
  const [contactChannel, setContactChannel] = useState<ContactChannel | "">("");
  const [contactResult, setContactResult] = useState<ContactResult | "">("");
  const [contactNote, setContactNote] = useState("");
  const [contactFollowUpAt, setContactFollowUpAt] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeEditMode, setDisputeEditMode] = useState(false);
  const [disputeCloseMode, setDisputeCloseMode] = useState<"" | "resolve" | "reject">("");
  const [disputeReason, setDisputeReason] = useState<DisputeReason | "">("");
  const [disputeDescription, setDisputeDescription] = useState("");
  const [disputeParty, setDisputeParty] = useState<DisputeParty | "">("");
  const [disputeReviewAt, setDisputeReviewAt] = useState("");
  const [disputeCloseComment, setDisputeCloseComment] = useState("");
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [escalationEditMode, setEscalationEditMode] = useState(false);
  const [escalationCompleteMode, setEscalationCompleteMode] = useState(false);
  const [escalationReason, setEscalationReason] = useState<EscalationReason | "">("");
  const [escalationPriority, setEscalationPriority] = useState<EscalationPriority | "">(
    ""
  );
  const [escalationTeam, setEscalationTeam] = useState<EscalationTeam | "">("");
  const [escalationRequestedAction, setEscalationRequestedAction] = useState("");
  const [escalationDueDate, setEscalationDueDate] = useState("");
  const [escalationNote, setEscalationNote] = useState("");
  const [escalationCompleteComment, setEscalationCompleteComment] = useState("");
  const [paymentPlanOpen, setPaymentPlanOpen] = useState(false);
  const [paymentPlanEditMode, setPaymentPlanEditMode] = useState(false);
  const [paymentPlanCancelMode, setPaymentPlanCancelMode] = useState(false);
  const [paymentPlanRecordMode, setPaymentPlanRecordMode] = useState(false);
  const [paymentPlanAmount, setPaymentPlanAmount] = useState("");
  const [paymentPlanInstallments, setPaymentPlanInstallments] = useState<
    PaymentPlanInstallmentInput[]
  >([emptyInstallmentDraft(), emptyInstallmentDraft(), emptyInstallmentDraft()]);
  const [paymentPlanReplacePromise, setPaymentPlanReplacePromise] = useState(false);
  const [paymentPlanCancelReason, setPaymentPlanCancelReason] = useState("");
  const [paymentPlanRecordInstallmentId, setPaymentPlanRecordInstallmentId] =
    useState("");
  const [paymentPlanRecordAmount, setPaymentPlanRecordAmount] = useState("");
  const [paymentPlanRecordNote, setPaymentPlanRecordNote] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesEditId, setNotesEditId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteAuthor, setNoteAuthor] = useState("");
  const [noteCategory, setNoteCategory] = useState<CollectionNoteCategory | "">("");
  const [notePinned, setNotePinned] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [remindersEditId, setRemindersEditId] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [reminderKind, setReminderKind] = useState<ReminderKind | "">("");
  const [reminderDueDate, setReminderDueDate] = useState("");
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentsEditId, setAttachmentsEditId] = useState("");
  const [attachmentFileName, setAttachmentFileName] = useState("");
  const [attachmentContentType, setAttachmentContentType] = useState("");
  const [attachmentSizeBytes, setAttachmentSizeBytes] = useState(0);
  const [attachmentContentDataUrl, setAttachmentContentDataUrl] = useState("");
  const [attachmentCategory, setAttachmentCategory] = useState<
    AttachmentCategory | ""
  >("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachmentUploadedBy, setAttachmentUploadedBy] = useState("");
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);

  const [page, setPage] = useState(() => (initialPage < 1 ? 1 : Math.floor(initialPage)));
  const previousWorkspaceId = useRef<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(INVOICE_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [documentNumber, setDocumentNumber] = useState(buildDemoDocumentNumber);
  const [counterpartyReference, setCounterpartyReference] = useState("demo-counterparty");
  const [currency, setCurrency] = useState("UAH");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [issueTarget, setIssueTarget] = useState<Invoice | null>(null);
  const [issueDueDate, setIssueDueDate] = useState(defaultDueDateInputValue);
  const [issueQuantity, setIssueQuantity] = useState("1");
  const [issueUnitPrice, setIssueUnitPrice] = useState("");
  const [issueLineDescription, setIssueLineDescription] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueSuccess, setIssueSuccess] = useState<string | null>(null);
  const [dueDateEditTarget, setDueDateEditTarget] = useState<Invoice | null>(null);
  const [dueDateEditValue, setDueDateEditValue] = useState("");
  const [dueDateEditBusy, setDueDateEditBusy] = useState(false);
  const [dueDateEditError, setDueDateEditError] = useState<string | null>(null);
  const [dueDateEditSuccess, setDueDateEditSuccess] = useState<string | null>(null);
  const [savingDueDateInvoiceId, setSavingDueDateInvoiceId] = useState<string | null>(null);
  const [headerEditTarget, setHeaderEditTarget] = useState<Invoice | null>(null);
  const [headerEditBaseline, setHeaderEditBaseline] =
    useState<DraftInvoiceHeaderEditorValues | null>(null);
  const [headerEditBusy, setHeaderEditBusy] = useState(false);
  const [headerEditError, setHeaderEditError] = useState<string | null>(null);
  const [headerEditSuccess, setHeaderEditSuccess] = useState<string | null>(null);
  const [savingHeaderInvoiceId, setSavingHeaderInvoiceId] = useState<string | null>(null);
  const [createAccrualTarget, setCreateAccrualTarget] = useState<Invoice | null>(null);
  const [createAccrualBaseline, setCreateAccrualBaseline] =
    useState<CreateAccrualFromInvoiceValues | null>(null);
  const [createAccrualBusy, setCreateAccrualBusy] = useState(false);
  const [createAccrualError, setCreateAccrualError] = useState<string | null>(null);
  const [createAccrualSuccess, setCreateAccrualSuccess] = useState<string | null>(null);
  const [savingCreateAccrualInvoiceId, setSavingCreateAccrualInvoiceId] = useState<
    string | null
  >(null);
  const [createdAccrualId, setCreatedAccrualId] = useState<string | null>(null);
  const [relatedAccruals, setRelatedAccruals] = useState<Accrual[]>([]);
  const [relatedAccrualsLoading, setRelatedAccrualsLoading] = useState(false);
  const [relatedAccrualsError, setRelatedAccrualsError] = useState<string | null>(null);
  const [lineAddTarget, setLineAddTarget] = useState<Invoice | null>(null);
  const [lineAddQuantity, setLineAddQuantity] = useState("1");
  const [lineAddUnitPrice, setLineAddUnitPrice] = useState("");
  const [lineAddDescription, setLineAddDescription] = useState("");
  const [lineAddBusy, setLineAddBusy] = useState(false);
  const [lineAddError, setLineAddError] = useState<string | null>(null);
  const [lineAddSuccess, setLineAddSuccess] = useState<string | null>(null);
  const [savingLineInvoiceId, setSavingLineInvoiceId] = useState<string | null>(null);
  const [lineUpdateTarget, setLineUpdateTarget] =
    useState<DraftInvoiceLineEditorTarget | null>(null);
  const [lineUpdateQuantity, setLineUpdateQuantity] = useState("1");
  const [lineUpdateUnitPrice, setLineUpdateUnitPrice] = useState("");
  const [lineUpdateDescription, setLineUpdateDescription] = useState("");
  const [lineUpdateBusy, setLineUpdateBusy] = useState(false);
  const [lineUpdateError, setLineUpdateError] = useState<string | null>(null);
  const [lineUpdateSuccess, setLineUpdateSuccess] = useState<string | null>(null);
  const [savingLineUpdateInvoiceId, setSavingLineUpdateInvoiceId] = useState<string | null>(
    null
  );
  const [lineRemoveTarget, setLineRemoveTarget] =
    useState<DraftInvoiceLineEditorTarget | null>(null);
  const [lineRemoveBusy, setLineRemoveBusy] = useState(false);
  const [lineRemoveError, setLineRemoveError] = useState<string | null>(null);
  const [lineRemoveSuccess, setLineRemoveSuccess] = useState<string | null>(null);
  const [savingLineRemoveInvoiceId, setSavingLineRemoveInvoiceId] = useState<string | null>(
    null
  );
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailErrorRetryable, setDetailErrorRetryable] = useState(false);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailRequestSeq = useRef(0);
  const issueBusyRef = useRef(false);
  const issuingInvoiceIdRef = useRef<string | null>(null);
  const dueDateEditBusyRef = useRef(false);
  const savingDueDateInvoiceIdRef = useRef<string | null>(null);
  const headerEditBusyRef = useRef(false);
  const savingHeaderInvoiceIdRef = useRef<string | null>(null);
  const createAccrualBusyRef = useRef(false);
  const savingCreateAccrualInvoiceIdRef = useRef<string | null>(null);
  const relatedAccrualsAbortRef = useRef<AbortController | null>(null);
  const relatedAccrualsRequestSeq = useRef(0);
  const lineAddBusyRef = useRef(false);
  const savingLineInvoiceIdRef = useRef<string | null>(null);
  const lineUpdateBusyRef = useRef(false);
  const savingLineUpdateInvoiceIdRef = useRef<string | null>(null);
  const lineRemoveBusyRef = useRef(false);
  const savingLineRemoveInvoiceIdRef = useRef<string | null>(null);

  function isAnyInvoiceMutationBusy(): boolean {
    return (
      issueBusyRef.current ||
      dueDateEditBusyRef.current ||
      headerEditBusyRef.current ||
      createAccrualBusyRef.current ||
      lineAddBusyRef.current ||
      lineUpdateBusyRef.current ||
      lineRemoveBusyRef.current
    );
  }

  useEffect(() => {
    if (workspace) {
      setCurrency(workspace.defaultCurrency);
    }
  }, [workspace]);

  useEffect(() => {
    const workspaceId = workspace?.id ?? null;
    const previousId = previousWorkspaceId.current;
    previousWorkspaceId.current = workspaceId;

    if (previousId !== null && previousId !== workspaceId) {
      setDraftFilters(emptyFilters);
      setAppliedFilters(emptyFilters);
      setFilterValidationError(null);
      setPage(1);
      setInvoices([]);
      setTotalCount(0);
      setError(null);
      setCreateError(null);
      setCreateSuccess(null);
      setHighlightedId(null);
      setDocumentNumber(buildDemoDocumentNumber());
      setIssueTarget(null);
      setIssueError(null);
      setIssueSuccess(null);
      setDueDateEditTarget(null);
      setDueDateEditValue("");
      setDueDateEditError(null);
      setDueDateEditSuccess(null);
      setHeaderEditTarget(null);
      setHeaderEditBaseline(null);
      setHeaderEditError(null);
      setHeaderEditSuccess(null);
      setCreateAccrualTarget(null);
      setCreateAccrualBaseline(null);
      setCreateAccrualError(null);
      setCreateAccrualSuccess(null);
      setCreatedAccrualId(null);
      setRelatedAccruals([]);
      setRelatedAccrualsLoading(false);
      setRelatedAccrualsError(null);
      setLineAddTarget(null);
      resetLineAddForm();
      setLineAddError(null);
      setLineAddSuccess(null);
      setLineUpdateTarget(null);
      resetLineUpdateForm();
      setLineUpdateError(null);
      setLineUpdateSuccess(null);
      setLineRemoveTarget(null);
      setLineRemoveError(null);
      setLineRemoveSuccess(null);
      dismissDetailFromUrl({ replace: true });
      setInvoiceQueue("");
      setAgingBucket("");
      setCollectionPanel("");
      setPromiseGroup("");
      setPromiseSearch("");
      setPromiseSearchDraft("");
      onDiscoveryChange?.(1, emptyFilters, "", "");
    }
  }, [workspace?.id, onDiscoveryChange, onSelectedInvoiceIdChange, selectedInvoiceId]);

  const loadPage = useCallback(
    async (
      workspaceId: string,
      nextPage: number,
      filters: InvoiceListFilters,
      queue: InvoiceQueueMode = ""
    ) => {
      const requestPageSize =
        queue === "overdue" ? COLLECTIONS_PAGE_SIZE : INVOICE_PAGE_SIZE;
      const { query, validationError } = buildInvoiceListQuery(
        nextPage,
        requestPageSize,
        filters,
        queue
      );

      if (validationError) {
        setFilterValidationError(validationError);
        setError(null);
        setLoading(false);
        return;
      }

      setFilterValidationError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);

      try {
        const result = await listInvoicesPaged(workspaceId, query, controller.signal);
        if (seq !== requestSeq.current) {
          return;
        }

        setInvoices(result.items);
        setTotalCount(result.totalCount);
        setPage(result.page);
        setPageSize(result.pageSize);
      } catch (loadError) {
        if (seq !== requestSeq.current) {
          return;
        }

        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setInvoices([]);
        setTotalCount(0);
        setError(
          loadError instanceof Error ? loadError.message : t("invoices.listLoadFailed")
        );
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!workspace) {
      return;
    }

    void loadPage(workspace.id, page, appliedFilters, invoiceQueue);

    return () => {
      abortRef.current?.abort();
    };
  }, [workspace, page, appliedFilters, invoiceQueue, loadPage]);

  useEffect(() => {
    setPromiseFormOpen(false);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    setPromiseDateInput("");
    setPromiseNoteInput("");
    setPromiseBusy(false);
    setResolutionOpen(false);
    setResolutionKind("");
    setResolutionPaymentDate("");
    setResolutionPaidAmount("");
    setResolutionRemainingAmount("");
    setResolutionPromiseDate("");
    setResolutionReason("");
    setResolutionNote("");
    setContactOpen(false);
    setContactChannel("");
    setContactResult("");
    setContactNote("");
    setContactFollowUpAt("");
    setDisputeOpen(false);
    setDisputeEditMode(false);
    setDisputeCloseMode("");
    setDisputeReason("");
    setDisputeDescription("");
    setDisputeParty("");
    setDisputeReviewAt("");
    setDisputeCloseComment("");
    setEscalationOpen(false);
    setEscalationEditMode(false);
    setEscalationCompleteMode(false);
    setEscalationReason("");
    setEscalationPriority("");
    setEscalationTeam("");
    setEscalationRequestedAction("");
    setEscalationDueDate("");
    setEscalationNote("");
    setEscalationCompleteComment("");
    setPaymentPlanOpen(false);
    setPaymentPlanEditMode(false);
    setPaymentPlanCancelMode(false);
    setPaymentPlanRecordMode(false);
    setPaymentPlanAmount("");
    setPaymentPlanInstallments([
      emptyInstallmentDraft(),
      emptyInstallmentDraft(),
      emptyInstallmentDraft()
    ]);
    setPaymentPlanReplacePromise(false);
    setPaymentPlanCancelReason("");
    setPaymentPlanRecordInstallmentId("");
    setPaymentPlanRecordAmount("");
    setPaymentPlanRecordNote("");
    setNotesOpen(false);
    setNotesEditId("");
    setNoteBody("");
    setNoteAuthor("");
    setNoteCategory("");
    setNotePinned(false);
    setRemindersOpen(false);
    setRemindersEditId("");
    setReminderTitle("");
    setReminderNote("");
    setReminderKind("");
    setReminderDueDate("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setAttachmentFileName("");
    setAttachmentContentType("");
    setAttachmentSizeBytes(0);
    setAttachmentContentDataUrl("");
    setAttachmentCategory("");
    setAttachmentDescription("");
    setAttachmentUploadedBy("");
  }, [detailTargetId]);

  function publishDiscovery(
    nextPage: number,
    filters: InvoiceListFilters,
    nextQueue: InvoiceQueueMode,
    nextAging: AgingBucketFilter,
    nextPanel: CollectionPanelMode = "",
    nextGroup: PromiseGroupFilter = "",
    nextSearch: string = "",
    nextWorkbenchSort: WorkbenchSortMode = "priority",
    nextHideCompleted: boolean = false,
    nextWorkbenchSection: WorkbenchSectionFilter = "",
    historyOverride?: {
      open?: boolean;
      type?: CollectionActivityEventTypeFilter;
      search?: string;
      expanded?: boolean;
    },
    nextQueueHideSettled?: boolean
  ) {
    const panel: CollectionPanelMode =
      nextQueue === "overdue" && isPromisePanel(nextPanel) ? nextPanel : "";
    const historyOpen =
      nextQueue === "overdue" && (historyOverride?.open ?? caseHistoryOpen);
    const historyType = historyOverride?.type ?? caseHistoryType;
    const historySearch = historyOverride?.search ?? caseHistorySearch;
    const historyExpanded = historyOverride?.expanded ?? caseHistoryExpanded;
    const hideSettled =
      nextQueue === "overdue"
        ? (nextQueueHideSettled ?? queueHideSettled)
        : true;
    onDiscoveryChange?.(
      nextPage,
      filters,
      nextQueue,
      nextQueue === "overdue" ? nextAging : "",
      panel,
      isPromisePanel(panel) ? nextGroup : "",
      isPromisePanel(panel) ? nextSearch : "",
      panel === "workbench" ? nextWorkbenchSort : "priority",
      panel === "workbench" ? nextHideCompleted : false,
      panel === "workbench" ? nextWorkbenchSection : "",
      historyOpen,
      historyOpen ? historyType : "",
      historyOpen ? historySearch : "",
      historyOpen ? historyExpanded : false,
      hideSettled
    );
  }

  function clearPromisePanelState() {
    setCollectionPanel("");
    setPromiseGroup("");
    setPromiseSearch("");
    setPromiseSearchDraft("");
    setWorkbenchSection("");
    setWorkbenchSort("priority");
    setWorkbenchHideCompleted(false);
    setWorkbenchSelectedIds([]);
    setWorkbenchMassMessage(null);
    setCaseHistoryOpen(false);
    setCaseHistoryType("");
    setCaseHistorySearch("");
    setCaseHistorySearchDraft("");
    setCaseHistoryExpanded(false);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQueue: InvoiceQueueMode =
      invoiceQueue === "overdue" &&
      (draftFilters.status === "Issued" || draftFilters.status === "")
        ? "overdue"
        : "";
    const nextAging: AgingBucketFilter = nextQueue === "overdue" ? agingBucket : "";
    const nextPanel: CollectionPanelMode =
      nextQueue === "overdue" ? collectionPanel : "";
    const nextGroup: PromiseGroupFilter = isPromisePanel(nextPanel) ? promiseGroup : "";
    const nextSearch = isPromisePanel(nextPanel) ? promiseSearch : "";
    const nextWbSort: WorkbenchSortMode =
      nextPanel === "workbench" ? workbenchSort : "priority";
    const nextHide = nextPanel === "workbench" ? workbenchHideCompleted : false;
    const nextWbSection: WorkbenchSectionFilter =
      nextPanel === "workbench" ? workbenchSection : "";
    const filtersForQuery =
      nextQueue === "overdue"
        ? { ...draftFilters, status: "Issued" as const }
        : { ...draftFilters };
    const { validationError } = buildInvoiceListQuery(
      1,
      nextQueue === "overdue" ? COLLECTIONS_PAGE_SIZE : INVOICE_PAGE_SIZE,
      filtersForQuery,
      nextQueue
    );
    if (validationError) {
      setFilterValidationError(validationError);
      return;
    }

    setFilterValidationError(null);
    setPage(1);
    setAppliedFilters({ ...filtersForQuery });
    setDraftFilters({ ...filtersForQuery });
    setInvoiceQueue(nextQueue);
    setAgingBucket(nextAging);
    if (nextQueue !== "overdue") {
      clearPromisePanelState();
      setQueueHideSettled(true);
    }
    publishDiscovery(
      1,
      { ...filtersForQuery },
      nextQueue,
      nextAging,
      nextPanel,
      nextGroup,
      nextSearch,
      nextWbSort,
      nextHide,
      nextWbSection
    );
  }

  function clearFilters() {
    if (isOverdueInvoiceQueue(invoiceQueue)) {
      if (onShowIssuedInvoices) {
        onShowIssuedInvoices();
        return;
      }

      const next = issuedInvoicesDiscovery().invoiceFilters;
      setDraftFilters(next);
      setAppliedFilters(next);
      setInvoiceQueue("");
      setAgingBucket("");
      setFilterValidationError(null);
      setPage(1);
      clearPromisePanelState();
      onDiscoveryChange?.(1, next, "", "");
      return;
    }

    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setInvoiceQueue("");
    setAgingBucket("");
    clearPromisePanelState();
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, emptyFilters, "", "");
  }

  async function handleCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || createBusy) {
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineUpdateError(null);
    setLineUpdateSuccess(null);
    setLineRemoveError(null);
    setLineRemoveSuccess(null);
    setHeaderEditError(null);
    setHeaderEditSuccess(null);
    dismissDetailFromUrl();

    try {
      const created = await createInvoice(workspace.id, {
        documentNumber,
        counterpartyReference,
        currency
      });
      setDocumentNumber(buildDemoDocumentNumber());
      setDraftFilters(emptyFilters);
      setAppliedFilters(emptyFilters);
      setInvoiceQueue("");
      setAgingBucket("");
      setCollectionPanel("");
      setPromiseGroup("");
      setPromiseSearch("");
      setPromiseSearchDraft("");
      setFilterValidationError(null);
      setPage(1);
      setHighlightedId(created.id);
      setIssueTarget(null);
      setDueDateEditTarget(null);
      setDueDateEditValue("");
      setLineAddTarget(null);
      resetLineAddForm();
      setLineUpdateTarget(null);
      resetLineUpdateForm();
      setLineRemoveTarget(null);
      setHeaderEditTarget(null);
      setHeaderEditBaseline(null);
      setCreateSuccess(
        t("invoices.createSuccess", { document: created.documentNumber })
      );
      onDiscoveryChange?.(1, emptyFilters, "", "");
      await loadPage(workspace.id, 1, emptyFilters, "");
    } catch (createErr) {
      setCreateError(
        createErr instanceof Error ? createErr.message : t("invoices.createFailed")
      );
    } finally {
      setCreateBusy(false);
    }
  }

  function resetLineAddForm() {
    const initial = initialDraftInvoiceLineAddInput();
    setLineAddQuantity(initial.quantity);
    setLineAddUnitPrice(initial.unitPrice);
    setLineAddDescription(initial.description);
  }

  function resetLineUpdateForm() {
    setLineUpdateQuantity("1");
    setLineUpdateUnitPrice("");
    setLineUpdateDescription("");
  }

  function clearLineUpdateEditor() {
    setLineUpdateTarget(null);
    resetLineUpdateForm();
    setLineUpdateError(null);
  }

  function clearLineRemoveEditor() {
    setLineRemoveTarget(null);
    setLineRemoveError(null);
  }

  function clearHeaderEditor() {
    setHeaderEditTarget(null);
    setHeaderEditBaseline(null);
    setHeaderEditError(null);
  }

  function beginHeaderEdit(invoice: Invoice, options: BeginEditorOptions = {}) {
    if (!canEditDraftInvoiceHeader(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    if (headerEditTarget?.id === invoice.id) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditError(null);
    setHeaderEditSuccess(null);
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    setHeaderEditTarget(invoice);
    setHeaderEditBaseline(valuesFromInvoice(invoice));
  }

  function cancelHeaderEdit() {
    if (headerEditBusyRef.current) {
      return;
    }

    clearHeaderEditor();
  }

  function clearCreateAccrualEditor() {
    setCreateAccrualTarget(null);
    setCreateAccrualBaseline(null);
    setCreateAccrualError(null);
  }

  function beginCreateAccrual(invoice: Invoice, options: BeginEditorOptions = {}) {
    if (!canCreateAccrualFromInvoice(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    if (createAccrualTarget?.id === invoice.id) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();
    setCreateAccrualError(null);
    setCreateAccrualSuccess(null);
    setCreatedAccrualId(null);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    setCreateAccrualTarget(invoice);
    setCreateAccrualBaseline(initialCreateAccrualFromInvoiceValues(invoice));
  }

  function cancelCreateAccrual() {
    if (createAccrualBusyRef.current) {
      return;
    }

    clearCreateAccrualEditor();
  }

  function beginIssue(invoice: Invoice, options: BeginEditorOptions = {}) {
    if (!isDraftInvoice(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    if (issueTarget?.id === invoice.id) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    const readiness = getInvoiceIssueReadiness(invoice);
    if (readiness.ready) {
      void completeIssue(invoice);
      return;
    }

    setIssueTarget(invoice);
    setIssueDueDate(
      invoice.dueDateUtc ? invoice.dueDateUtc.slice(0, 10) : defaultDueDateInputValue()
    );
    setIssueQuantity("1");
    setIssueUnitPrice("");
    setIssueLineDescription(invoice.documentNumber);
  }

  function cancelIssuePrepare() {
    if (issueBusyRef.current) {
      return;
    }

    setIssueTarget(null);
    setIssueError(null);
  }

  function beginDueDateEdit(invoice: Invoice, options: BeginEditorOptions = {}) {
    if (!canEditDraftInvoiceDueDate(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    if (dueDateEditTarget?.id === invoice.id) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    setDueDateEditTarget(invoice);
    setDueDateEditValue(initialDueDateInputValue(invoice));
  }

  function cancelDueDateEdit() {
    if (dueDateEditBusyRef.current) {
      return;
    }

    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setDueDateEditError(null);
  }

  function beginLineAdd(invoice: Invoice, options: BeginEditorOptions = {}) {
    if (!canAddDraftInvoiceLine(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    if (lineAddTarget?.id === invoice.id) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();
    setLineAddError(null);
    setLineAddSuccess(null);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    setLineAddTarget(invoice);
    resetLineAddForm();
  }

  function cancelLineAdd() {
    if (lineAddBusyRef.current) {
      return;
    }

    setLineAddTarget(null);
    resetLineAddForm();
    setLineAddError(null);
  }

  function beginLineUpdate(
    invoice: Invoice,
    lineId: string,
    options: BeginEditorOptions = {}
  ) {
    if (!canUpdateDraftInvoiceLine(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    const line = findInvoiceLine(invoice, lineId);
    if (!line) {
      return;
    }

    if (
      lineUpdateTarget?.invoice.id === invoice.id &&
      lineUpdateTarget.lineId === lineId
    ) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();
    setLineUpdateError(null);
    setLineUpdateSuccess(null);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    const initial = initialDraftInvoiceLineUpdateInput(line);
    setLineUpdateTarget({ invoice, lineId, line });
    setLineUpdateQuantity(initial.quantity);
    setLineUpdateUnitPrice(initial.unitPrice);
    setLineUpdateDescription(initial.description);
  }

  function cancelLineUpdate() {
    if (lineUpdateBusyRef.current) {
      return;
    }

    clearLineUpdateEditor();
  }

  function beginLineRemove(
    invoice: Invoice,
    lineId: string,
    options: BeginEditorOptions = {}
  ) {
    if (!canRemoveDraftInvoiceLine(invoice) || isAnyInvoiceMutationBusy()) {
      return;
    }

    const line = findInvoiceLine(invoice, lineId);
    if (!line) {
      return;
    }

    if (
      lineRemoveTarget?.invoice.id === invoice.id &&
      lineRemoveTarget.lineId === lineId
    ) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();
    setLineRemoveError(null);
    setLineRemoveSuccess(null);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    setLineRemoveTarget({ invoice, lineId, line });
  }

  function cancelLineRemove() {
    if (lineRemoveBusyRef.current) {
      return;
    }

    clearLineRemoveEditor();
  }

  function clearDetailPanel() {
    detailAbortRef.current?.abort();
    relatedAccrualsAbortRef.current?.abort();
    setDetailTargetId(null);
    setDetailInvoice(null);
    setDetailLoading(false);
    setDetailError(null);
    setDetailErrorRetryable(false);
    setRelatedAccruals([]);
    setRelatedAccrualsLoading(false);
    setRelatedAccrualsError(null);
  }

  function dismissDetailFromUrl(options: InvoiceIdChangeOptions = {}) {
    clearDetailPanel();
    if (selectedInvoiceId) {
      onSelectedInvoiceIdChange?.(null, options);
    }
  }

  function isDetailRelatedPending(): boolean {
    if (!detailTargetId) {
      return false;
    }

    const issuePending =
      issueBusyRef.current &&
      (issueTarget?.id === detailTargetId ||
        issuingInvoiceIdRef.current === detailTargetId);
    const dueDatePending =
      dueDateEditBusyRef.current &&
      (dueDateEditTarget?.id === detailTargetId ||
        savingDueDateInvoiceIdRef.current === detailTargetId);
    const lineAddPending =
      lineAddBusyRef.current &&
      (lineAddTarget?.id === detailTargetId ||
        savingLineInvoiceIdRef.current === detailTargetId);
    const lineUpdatePending =
      lineUpdateBusyRef.current &&
      (lineUpdateTarget?.invoice.id === detailTargetId ||
        savingLineUpdateInvoiceIdRef.current === detailTargetId);
    const lineRemovePending =
      lineRemoveBusyRef.current &&
      (lineRemoveTarget?.invoice.id === detailTargetId ||
        savingLineRemoveInvoiceIdRef.current === detailTargetId);
    const headerEditPending =
      headerEditBusyRef.current &&
      (headerEditTarget?.id === detailTargetId ||
        savingHeaderInvoiceIdRef.current === detailTargetId);
    const createAccrualPending =
      createAccrualBusyRef.current &&
      (createAccrualTarget?.id === detailTargetId ||
        savingCreateAccrualInvoiceIdRef.current === detailTargetId);

    return Boolean(
      issuePending ||
        dueDatePending ||
        lineAddPending ||
        lineUpdatePending ||
        lineRemovePending ||
        headerEditPending ||
        createAccrualPending
    );
  }

  function closeOpenEditorsForDetailClose() {
    setIssueTarget(null);
    setIssueError(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setDueDateEditError(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineAddError(null);
    clearLineUpdateEditor();
    clearLineRemoveEditor();
    clearHeaderEditor();
    clearCreateAccrualEditor();
  }

  function closeDetailPanel() {
    if (isDetailRelatedPending()) {
      return;
    }

    closeOpenEditorsForDetailClose();
    if (caseHistoryOpen) {
      setCaseHistoryOpen(false);
      setCaseHistoryType("");
      setCaseHistorySearch("");
      setCaseHistorySearchDraft("");
      setCaseHistoryExpanded(false);
      publishDiscovery(
        page,
        appliedFilters,
        invoiceQueue,
        agingBucket,
        collectionPanel,
        promiseGroup,
        promiseSearch,
        workbenchSort,
        workbenchHideCompleted,
        workbenchSection,
        { open: false, type: "", search: "", expanded: false }
      );
    }
    dismissDetailFromUrl();
  }

  async function refreshDetailAfterMutation(invoiceId: string) {
    if (!workspace || !shouldReloadDetailAfterMutation(detailTargetId, invoiceId)) {
      return;
    }

    await loadInvoiceDetail(workspace.id, invoiceId, { afterSuccessfulMutation: true });
  }

  async function refreshDetailAfterEditorFailure(invoiceId: string) {
    if (!workspace || !shouldReloadDetailAfterMutation(detailTargetId, invoiceId)) {
      return;
    }

    await loadInvoiceDetail(workspace.id, invoiceId);
  }

  async function loadRelatedAccruals(workspaceId: string, invoiceId: string) {
    relatedAccrualsAbortRef.current?.abort();
    const controller = new AbortController();
    relatedAccrualsAbortRef.current = controller;
    const seq = ++relatedAccrualsRequestSeq.current;

    setRelatedAccrualsLoading(true);
    setRelatedAccrualsError(null);

    try {
      const items = await listAccrualsByInvoice(workspaceId, invoiceId, controller.signal);
      if (seq !== relatedAccrualsRequestSeq.current) {
        return;
      }

      setRelatedAccruals(items);
      setRelatedAccrualsLoading(false);
      setRelatedAccrualsError(null);
    } catch (loadError) {
      if (seq !== relatedAccrualsRequestSeq.current) {
        return;
      }

      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      const failure = interpretRelatedAccrualsLoadError(loadError);
      setRelatedAccruals([]);
      setRelatedAccrualsLoading(false);
      setRelatedAccrualsError(failure.message);
    }
  }

  async function refreshRelatedAccrualsAfterCreate(sourceInvoiceId: string) {
    if (
      !workspace ||
      !shouldReloadRelatedAccrualsAfterCreate(detailTargetId, sourceInvoiceId)
    ) {
      return;
    }

    await loadRelatedAccruals(workspace.id, sourceInvoiceId);
  }

  async function loadInvoiceDetail(
    workspaceId: string,
    invoiceId: string,
    options: { afterSuccessfulMutation?: boolean } = {}
  ) {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const seq = ++detailRequestSeq.current;

    setDetailTargetId(invoiceId);
    setDetailInvoice(null);
    setDetailLoading(true);
    setDetailError(null);
    setDetailErrorRetryable(false);
    setRelatedAccruals([]);
    setRelatedAccrualsError(null);

    try {
      const invoice = await getInvoice(workspaceId, invoiceId, controller.signal);
      if (seq !== detailRequestSeq.current) {
        return;
      }

      setDetailInvoice(invoice);
      setDetailLoading(false);
      setDetailError(null);
      setDetailErrorRetryable(false);
      void loadRelatedAccruals(workspaceId, invoiceId);
    } catch (loadError) {
      if (seq !== detailRequestSeq.current) {
        return;
      }

      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      const failure = interpretInvoiceDetailLoadError(loadError);
      if (failure.clearInvoiceData) {
        setDetailInvoice(null);
        setRelatedAccruals([]);
        setRelatedAccrualsLoading(false);
        setRelatedAccrualsError(null);
      }

      setDetailLoading(false);
      if (options.afterSuccessfulMutation && failure.kind === "retryable") {
        setDetailError(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE);
        setDetailErrorRetryable(true);
      } else {
        setDetailError(failure.message);
        setDetailErrorRetryable(failure.kind === "retryable");
      }

      if (failure.refreshList) {
        await loadPage(workspaceId, page, appliedFilters, invoiceQueue);
      }
    }
  }

  /**
   * URL is the navigation source for which invoice detail is open.
   * getInvoice remains authoritative for panel data.
   */
  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (!selectedInvoiceId) {
      if (detailTargetId !== null && !isDetailRelatedPending()) {
        closeOpenEditorsForDetailClose();
        clearDetailPanel();
      }
      return;
    }

    if (detailTargetId === selectedInvoiceId) {
      return;
    }

    setCreateSuccess(null);
    setIssueSuccess(null);
    setIssueError(null);
    setIssueTarget(null);
    setDueDateEditSuccess(null);
    setDueDateEditError(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddSuccess(null);
    setLineAddError(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();

    void loadInvoiceDetail(workspace.id, selectedInvoiceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on selection + workspace
  }, [workspace?.id, selectedInvoiceId]);

  function beginViewInvoiceDetails(invoice: Invoice) {
    if (!workspace || !canViewInvoiceDetails(invoice)) {
      return;
    }

    if (selectedInvoiceId === invoice.id && detailTargetId === invoice.id) {
      return;
    }

    setCreateSuccess(null);
    setIssueSuccess(null);
    setIssueError(null);
    setIssueTarget(null);
    setDueDateEditSuccess(null);
    setDueDateEditError(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddSuccess(null);
    setLineAddError(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    onSelectedInvoiceIdChange?.(invoice.id);
  }

  function retryInvoiceDetail() {
    if (!workspace || !detailTargetId || !detailErrorRetryable) {
      return;
    }

    void loadInvoiceDetail(workspace.id, detailTargetId);
  }

  async function completeIssue(invoice: Invoice, preparation?: {
    dueDateUtc?: string;
    quantity?: number;
    unitPrice?: number;
    description?: string | null;
  }) {
    if (!workspace || issueBusyRef.current) {
      return;
    }

    issueBusyRef.current = true;
    issuingInvoiceIdRef.current = invoice.id;
    setIssuingInvoiceId(invoice.id);
    setIssueBusy(true);
    setIssueError(null);
    setIssueSuccess(null);
    setCreateSuccess(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();

    try {
      const readiness = getInvoiceIssueReadiness(invoice);

      if (readiness.needsLine) {
        const quantity = preparation?.quantity;
        const unitPrice = preparation?.unitPrice;
        if (
          quantity === undefined ||
          unitPrice === undefined ||
          !Number.isFinite(quantity) ||
          !Number.isFinite(unitPrice)
        ) {
          throw new Error(t("invoices.issueNeedsLine"));
        }

        await addInvoiceLine(workspace.id, invoice.id, {
          quantity,
          unitPrice,
          description: preparation?.description
        });
      }

      if (readiness.needsDueDate) {
        if (!preparation?.dueDateUtc) {
          throw new Error(t("invoices.issueNeedsDueDate"));
        }

        await setInvoiceDueDate(workspace.id, invoice.id, preparation.dueDateUtc);
      }

      const issued = await issueInvoice(workspace.id, invoice.id);
      setIssueTarget(null);
      setHighlightedId(issued.id);
      setIssueSuccess(
        t("invoices.issueSuccess", {
          document: issued.documentNumber,
          status: issued.status
        })
      );
      await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
      await refreshDetailAfterMutation(issued.id);
    } catch (issueErr) {
      const failure = interpretInvoiceIssueError(issueErr);
      setIssueError(failure.message);
      if (!failure.keepEditorOpen) {
        setIssueTarget(null);
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(invoice.id);
        } catch {
          // Keep the issue error; list refresh failure is secondary.
        }
      }
    } finally {
      issueBusyRef.current = false;
      issuingInvoiceIdRef.current = null;
      setIssuingInvoiceId(null);
      setIssueBusy(false);
    }
  }

  async function handlePrepareAndIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!issueTarget || issueBusyRef.current) {
      return;
    }

    const readiness = getInvoiceIssueReadiness(issueTarget);
    let dueDateUtc: string | undefined;
    let quantity: number | undefined;
    let unitPrice: number | undefined;

    try {
      if (readiness.needsDueDate) {
        dueDateUtc = toDueDateUtcIso(issueDueDate);
      }

      if (readiness.needsLine) {
        quantity = Number(issueQuantity.replace(",", "."));
        unitPrice = Number(issueUnitPrice.replace(",", "."));
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(t("invoices.error.quantityPositive"));
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new Error(t("invoices.error.priceNonNegative"));
        }
        if (quantity * unitPrice <= 0) {
          throw new Error(t("invoices.error.lineAmountPositive"));
        }
      }
    } catch (validationErr) {
      setIssueError(
        validationErr instanceof Error
          ? validationErr.message
          : t("invoices.issuePrepareInvalid")
      );
      return;
    }

    await completeIssue(issueTarget, {
      dueDateUtc,
      quantity,
      unitPrice,
      description: issueLineDescription.trim() || null
    });
  }

  async function handleSaveDueDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !workspace ||
      !dueDateEditTarget ||
      !canEditDraftInvoiceDueDate(dueDateEditTarget) ||
      dueDateEditBusyRef.current
    ) {
      return;
    }

    const target = dueDateEditTarget;
    dueDateEditBusyRef.current = true;
    savingDueDateInvoiceIdRef.current = target.id;
    setSavingDueDateInvoiceId(target.id);
    setDueDateEditBusy(true);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();

    try {
      const updated = await applyDraftInvoiceDueDateChange(
        workspace.id,
        target.id,
        dueDateEditValue,
        setInvoiceDueDate
      );
      setDueDateEditTarget(null);
      setDueDateEditValue("");
      setHighlightedId(updated.id);
      setDueDateEditSuccess(
        t("invoices.dueDateUpdateSuccess", { document: updated.documentNumber })
      );
      await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
      await refreshDetailAfterMutation(updated.id);
    } catch (editErr) {
      const failure = interpretDraftInvoiceDueDateEditError(editErr);
      setDueDateEditError(failure.message);
      if (!failure.keepEditorOpen) {
        setDueDateEditTarget(null);
        setDueDateEditValue("");
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the due-date error; list refresh failure is secondary.
        }
      }
    } finally {
      dueDateEditBusyRef.current = false;
      savingDueDateInvoiceIdRef.current = null;
      setSavingDueDateInvoiceId(null);
      setDueDateEditBusy(false);
    }
  }

  async function handleSaveHeaderEdit(values: DraftInvoiceHeaderEditorValues) {
    if (
      !workspace ||
      !headerEditTarget ||
      !headerEditBaseline ||
      !canEditDraftInvoiceHeader(headerEditTarget) ||
      headerEditBusyRef.current
    ) {
      return;
    }

    const target = headerEditTarget;
    const baseline = headerEditBaseline;
    headerEditBusyRef.current = true;
    savingHeaderInvoiceIdRef.current = target.id;
    setSavingHeaderInvoiceId(target.id);
    setHeaderEditBusy(true);
    setHeaderEditError(null);
    setHeaderEditSuccess(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setCreateAccrualSuccess(null);
    clearCreateAccrualEditor();

    try {
      const updated = await applyDraftInvoiceHeaderEditorChanges(
        workspace.id,
        target.id,
        baseline,
        values,
        {
          changeDocumentNumber: changeInvoiceDocumentNumber,
          changeCounterparty: changeInvoiceCounterparty,
          changeCurrency: changeInvoiceCurrency
        }
      );

      setHeaderEditTarget(null);
      setHeaderEditBaseline(null);

      if (!updated) {
        return;
      }

      setHighlightedId(updated.id);
      setHeaderEditSuccess(
        t("invoices.headerUpdateSuccess", { document: updated.documentNumber })
      );
      await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
      await refreshDetailAfterMutation(updated.id);
    } catch (editErr) {
      const failure = interpretDraftInvoiceHeaderEditorError(editErr);
      setHeaderEditError(failure.message);
      if (!failure.keepEditorOpen) {
        setHeaderEditTarget(null);
        setHeaderEditBaseline(null);
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the header error; list refresh failure is secondary.
        }
      }
    } finally {
      headerEditBusyRef.current = false;
      savingHeaderInvoiceIdRef.current = null;
      setSavingHeaderInvoiceId(null);
      setHeaderEditBusy(false);
    }
  }

  async function handleSaveCreateAccrual(values: CreateAccrualFromInvoiceValues) {
    if (
      !workspace ||
      !createAccrualTarget ||
      !createAccrualBaseline ||
      !canCreateAccrualFromInvoice(createAccrualTarget) ||
      createAccrualBusyRef.current
    ) {
      return;
    }

    const validationError = validateCreateAccrualFromInvoiceValues(values);
    if (validationError) {
      setCreateAccrualError(validationError);
      return;
    }

    const target = createAccrualTarget;
    createAccrualBusyRef.current = true;
    savingCreateAccrualInvoiceIdRef.current = target.id;
    setSavingCreateAccrualInvoiceId(target.id);
    setCreateAccrualBusy(true);
    setCreateAccrualError(null);
    setCreateAccrualSuccess(null);
    setCreatedAccrualId(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();

    try {
      const created = await applyCreateAccrualFromInvoice(
        workspace.id,
        target,
        values,
        { createAccrual }
      );

      setCreateAccrualTarget(null);
      setCreateAccrualBaseline(null);
      setCreatedAccrualId(created.id);
      setCreateAccrualSuccess(
        t("invoices.accrualCreateSuccess", {
          description: created.description,
          document: target.documentNumber
        })
      );
      await refreshRelatedAccrualsAfterCreate(target.id);
    } catch (createErr) {
      const failure = interpretCreateAccrualFromInvoiceError(createErr);
      setCreateAccrualError(failure.message);
      if (!failure.keepFormOpen) {
        setCreateAccrualTarget(null);
        setCreateAccrualBaseline(null);
      }

      if (failure.refreshInvoice) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the create error; invoice refresh failure is secondary.
        }
      }
    } finally {
      createAccrualBusyRef.current = false;
      savingCreateAccrualInvoiceIdRef.current = null;
      setSavingCreateAccrualInvoiceId(null);
      setCreateAccrualBusy(false);
    }
  }

  async function handleSaveLineAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !workspace ||
      !lineAddTarget ||
      !canAddDraftInvoiceLine(lineAddTarget) ||
      lineAddBusyRef.current
    ) {
      return;
    }

    const target = lineAddTarget;
    lineAddBusyRef.current = true;
    savingLineInvoiceIdRef.current = target.id;
    setSavingLineInvoiceId(target.id);
    setLineAddBusy(true);
    setLineAddError(null);
    setLineAddSuccess(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();

    try {
      const updated = await applyDraftInvoiceLineAdd(
        workspace.id,
        target.id,
        {
          quantity: lineAddQuantity,
          unitPrice: lineAddUnitPrice,
          description: lineAddDescription
        },
        addInvoiceLine
      );
      setLineAddTarget(null);
      resetLineAddForm();
      setHighlightedId(updated.id);
      setLineAddSuccess(t("invoices.lineAddSuccess", { document: updated.documentNumber }));
      await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
      await refreshDetailAfterMutation(updated.id);
    } catch (addErr) {
      const failure = interpretDraftInvoiceLineAddError(addErr);
      setLineAddError(failure.message);
      if (!failure.keepEditorOpen) {
        setLineAddTarget(null);
        resetLineAddForm();
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the line-add error; list refresh failure is secondary.
        }
      }
    } finally {
      lineAddBusyRef.current = false;
      savingLineInvoiceIdRef.current = null;
      setSavingLineInvoiceId(null);
      setLineAddBusy(false);
    }
  }

  async function handleSaveLineUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !workspace ||
      !lineUpdateTarget ||
      !canUpdateDraftInvoiceLine(lineUpdateTarget.invoice) ||
      lineUpdateBusyRef.current
    ) {
      return;
    }

    const target = lineUpdateTarget;
    lineUpdateBusyRef.current = true;
    savingLineUpdateInvoiceIdRef.current = target.invoice.id;
    setSavingLineUpdateInvoiceId(target.invoice.id);
    setLineUpdateBusy(true);
    setLineUpdateError(null);
    setLineUpdateSuccess(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineRemoveSuccess(null);
    clearLineRemoveEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();

    try {
      const updated = await applyDraftInvoiceLineUpdate(
        workspace.id,
        target.invoice.id,
        target.lineId,
        {
          quantity: lineUpdateQuantity,
          unitPrice: lineUpdateUnitPrice,
          description: lineUpdateDescription
        },
        updateInvoiceLine
      );
      clearLineUpdateEditor();
      setHighlightedId(updated.id);
      setLineUpdateSuccess(t("invoices.lineUpdateSuccess", { document: updated.documentNumber }));
      await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
      await refreshDetailAfterMutation(updated.id);
    } catch (updateErr) {
      const failure = interpretDraftInvoiceLineUpdateError(updateErr);
      setLineUpdateError(failure.message);
      if (!failure.keepEditorOpen) {
        clearLineUpdateEditor();
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(target.invoice.id);
        } catch {
          // Keep the line-update error; list refresh failure is secondary.
        }
      }
    } finally {
      lineUpdateBusyRef.current = false;
      savingLineUpdateInvoiceIdRef.current = null;
      setSavingLineUpdateInvoiceId(null);
      setLineUpdateBusy(false);
    }
  }

  async function handleConfirmLineRemove() {
    if (
      !workspace ||
      !lineRemoveTarget ||
      !canRemoveDraftInvoiceLine(lineRemoveTarget.invoice) ||
      lineRemoveBusyRef.current
    ) {
      return;
    }

    const target = lineRemoveTarget;
    lineRemoveBusyRef.current = true;
    savingLineRemoveInvoiceIdRef.current = target.invoice.id;
    setSavingLineRemoveInvoiceId(target.invoice.id);
    setLineRemoveBusy(true);
    setLineRemoveError(null);
    setLineRemoveSuccess(null);
    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);
    setIssueTarget(null);
    setDueDateEditError(null);
    setDueDateEditSuccess(null);
    setDueDateEditTarget(null);
    setDueDateEditValue("");
    setLineAddError(null);
    setLineAddSuccess(null);
    setLineAddTarget(null);
    resetLineAddForm();
    setLineUpdateSuccess(null);
    clearLineUpdateEditor();
    setHeaderEditSuccess(null);
    clearHeaderEditor();

    try {
      const updated = await applyDraftInvoiceLineRemove(
        workspace.id,
        target.invoice.id,
        target.lineId,
        removeInvoiceLine
      );
      clearLineRemoveEditor();
      setHighlightedId(updated.id);
      setLineRemoveSuccess(t("invoices.lineRemoveSuccess", { document: updated.documentNumber }));
      await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
      await refreshDetailAfterMutation(updated.id);
    } catch (removeErr) {
      const failure = interpretDraftInvoiceLineRemoveError(removeErr);
      setLineRemoveError(failure.message);
      if (!failure.keepConfirmationOpen) {
        clearLineRemoveEditor();
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters, invoiceQueue);
          await refreshDetailAfterEditorFailure(target.invoice.id);
        } catch {
          // Keep the line-remove error; list refresh failure is secondary.
        }
      }
    } finally {
      lineRemoveBusyRef.current = false;
      savingLineRemoveInvoiceIdRef.current = null;
      setSavingLineRemoveInvoiceId(null);
      setLineRemoveBusy(false);
    }
  }

  useEffect(() => {
    if (!highlightedId || invoices.length === 0) {
      return;
    }

    const row = document.querySelector(`[data-row-id="${highlightedId}"]`);
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlightedId, invoices]);

  const pages = totalPages(totalCount, pageSize);
  const canGoPrevious = page > 1 && !loading;
  const canGoNext = page < pages && !loading;
  const overdueQueueActive = isOverdueInvoiceQueue(invoiceQueue);
  const filtersActive = hasActiveInvoiceDiscovery(appliedFilters, invoiceQueue);
  const effectiveDueToForSummary = overdueQueueActive
    ? collectionsQueueDueToDateInput()
    : appliedFilters.dueToDate?.trim() || "";

  function formatTotals(totals: { amount: number; currency: string }[]): string {
    if (totals.length === 0) {
      return "—";
    }
    return totals.map((row) => formatMoney(row.amount, row.currency)).join(" · ");
  }
  const draftFilterActive =
    !overdueQueueActive &&
    appliedFilters.status === "Draft" &&
    !appliedFilters.documentNumber?.trim() &&
    !appliedFilters.counterpartyReference?.trim() &&
    !appliedFilters.createdFromDate?.trim() &&
    !appliedFilters.createdToDate?.trim() &&
    !appliedFilters.issuedFromDate?.trim() &&
    !appliedFilters.issuedToDate?.trim() &&
    !appliedFilters.dueFromDate?.trim() &&
    !appliedFilters.dueToDate?.trim() &&
    page === 1;

  const issuedFilterActive =
    !overdueQueueActive &&
    appliedFilters.status === "Issued" &&
    !appliedFilters.documentNumber?.trim() &&
    !appliedFilters.counterpartyReference?.trim() &&
    !appliedFilters.createdFromDate?.trim() &&
    !appliedFilters.createdToDate?.trim() &&
    !appliedFilters.issuedFromDate?.trim() &&
    !appliedFilters.issuedToDate?.trim() &&
    !appliedFilters.dueFromDate?.trim() &&
    !appliedFilters.dueToDate?.trim() &&
    page === 1;

  const overdueFilterActive =
    overdueQueueActive &&
    appliedFilters.status === "Issued" &&
    page === 1 &&
    !appliedFilters.documentNumber?.trim() &&
    !appliedFilters.counterpartyReference?.trim() &&
    !appliedFilters.createdFromDate?.trim() &&
    !appliedFilters.createdToDate?.trim() &&
    !appliedFilters.issuedFromDate?.trim() &&
    !appliedFilters.issuedToDate?.trim() &&
    !appliedFilters.dueFromDate?.trim() &&
    !agingBucket &&
    collectionPanel === "";

  const followUpsPanelActive = overdueQueueActive && collectionPanel === "followups";
  const workbenchPanelActive = overdueQueueActive && collectionPanel === "workbench";
  const promisePanelActive = followUpsPanelActive || workbenchPanelActive;
  const queueTableActive = overdueQueueActive && !promisePanelActive;

  const collectionsNow = new Date();
  // promiseRevision forces re-read after localStorage mutations.
  void promiseRevision;
  const promiseRecords = listPromiseRecordsFromStorage();
  const promiseRecordsById = recordsByInvoiceId(promiseRecords);
  const collectionsQueueAll = overdueQueueActive
    ? buildCollectionsQueue(invoices, agingBucket, collectionsNow)
    : invoices;
  const collectionsQueue = overdueQueueActive
    ? filterCollectionsQueueBySettlement(collectionsQueueAll, promiseRecordsById, {
        hideSettled: queueHideSettled
      })
    : collectionsQueueAll;
  const collectionsSummary = overdueQueueActive
    ? buildSettlementAwareCollectionsSummary(
        invoices,
        promiseRecordsById,
        agingBucket,
        collectionsNow,
        { hideSettled: queueHideSettled }
      )
    : null;
  const collectionsIds = collectionsQueue.map((invoice) => invoice.id);
  const collectionsPosition = collectionsQueuePosition(collectionsIds, detailTargetId);

  const promiseFollowUpItems = followUpsPanelActive
    ? filterPromiseFollowUps(
        buildPromiseFollowUpItems(invoices, promiseRecords, collectionsNow),
        { group: promiseGroup, search: promiseSearch }
      )
    : [];
  const promiseFollowUpAll = followUpsPanelActive
    ? buildPromiseFollowUpItems(invoices, promiseRecords, collectionsNow)
    : [];
  const promiseSummary = followUpsPanelActive
    ? buildPromiseFollowUpSummary(promiseFollowUpAll, collectionsNow)
    : null;
  const promiseGroups = followUpsPanelActive
    ? groupPromiseFollowUps(promiseFollowUpItems)
    : null;

  const workbenchCasesAll = workbenchPanelActive
    ? buildWorkbenchCases(invoices, promiseRecords, collectionsNow)
    : [];
  const workbenchKpi = workbenchPanelActive
    ? buildWorkbenchKpi(workbenchCasesAll, collectionsNow)
    : null;
  const workbenchFilteredCases = workbenchPanelActive
    ? filterWorkbenchCases(workbenchCasesAll, {
        section: workbenchSection,
        search: promiseSearch,
        sort: workbenchSort,
        hideCompleted: workbenchHideCompleted
      })
    : [];
  const workbenchSections = workbenchPanelActive
    ? buildWorkbenchSectionSummaries(workbenchCasesAll, {
        section: workbenchSection,
        search: promiseSearch,
        sort: workbenchSort,
        hideCompleted: workbenchHideCompleted
      })
    : [];
  const workbenchVisibleIds = new Set(workbenchFilteredCases.map((item) => item.invoiceId));

  const detailPromiseRecord =
    overdueQueueActive && detailTargetId
      ? readPromiseFromStorage(detailTargetId)
      : null;
  const caseHistoryView =
    overdueQueueActive && detailTargetId && caseHistoryOpen
      ? buildCaseHistoryView(
          detailPromiseRecord,
          {
            type: caseHistoryType,
            search: caseHistorySearch,
            expanded: caseHistoryExpanded
          },
          collectionsNow
        )
      : null;

  const displayInvoices = overdueQueueActive ? collectionsQueue : invoices;
  const listEmpty = workbenchPanelActive
    ? !loading && !error && workbenchFilteredCases.length === 0
    : followUpsPanelActive
      ? !loading && !error && promiseFollowUpItems.length === 0
      : overdueQueueActive
        ? !loading && !error && collectionsQueue.length === 0
        : !loading && !error && invoices.length === 0;

  function openNextCollectionsInvoice() {
    if (!collectionsPosition?.nextId) {
      return;
    }

    const nextInvoice = collectionsQueue.find(
      (invoice) => invoice.id === collectionsPosition.nextId
    );
    if (nextInvoice) {
      beginViewInvoiceDetails(nextInvoice);
    } else {
      onSelectedInvoiceIdChange?.(collectionsPosition.nextId);
    }
  }

  function applyDraftInvoicesFilter() {
    if (onShowDraftInvoices) {
      onShowDraftInvoices();
      return;
    }

    const next = draftInvoicesDiscovery().invoiceFilters;
    setDraftFilters(next);
    setAppliedFilters(next);
    setInvoiceQueue("");
    setAgingBucket("");
    clearPromisePanelState();
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, next, "", "");
  }

  function applyIssuedInvoicesFilter() {
    if (onShowIssuedInvoices) {
      onShowIssuedInvoices();
      return;
    }

    const next = issuedInvoicesDiscovery().invoiceFilters;
    setDraftFilters(next);
    setAppliedFilters(next);
    setInvoiceQueue("");
    setAgingBucket("");
    clearPromisePanelState();
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, next, "", "");
  }

  function applyOverdueIssuedInvoicesFilter() {
    if (onShowOverdueIssuedInvoices) {
      onShowOverdueIssuedInvoices();
      return;
    }

    const discovery = overdueIssuedInvoicesDiscovery();
    setDraftFilters(discovery.invoiceFilters);
    setAppliedFilters(discovery.invoiceFilters);
    setInvoiceQueue("overdue");
    setAgingBucket("");
    setQueueHideSettled(true);
    clearPromisePanelState();
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, discovery.invoiceFilters, "overdue", "");
  }

  function applyAgingBucket(nextBucket: AgingBucketFilter) {
    if (!isOverdueInvoiceQueue(invoiceQueue)) {
      return;
    }

    setAgingBucket(nextBucket);
    setPage(1);
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      nextBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection
    );
  }

  function applyQueueHideSettled(nextHideSettled: boolean) {
    if (!isOverdueInvoiceQueue(invoiceQueue) || collectionPanel !== "") {
      return;
    }

    setQueueHideSettled(nextHideSettled);
    publishDiscovery(
      page,
      appliedFilters,
      "overdue",
      agingBucket,
      "",
      "",
      "",
      "priority",
      false,
      "",
      undefined,
      nextHideSettled
    );
  }

  function applyCollectionPanel(nextPanel: CollectionPanelMode) {
    if (!isOverdueInvoiceQueue(invoiceQueue)) {
      return;
    }

    const panel: CollectionPanelMode = isPromisePanel(nextPanel) ? nextPanel : "";
    setCollectionPanel(panel);
    setWorkbenchSelectedIds([]);
    setWorkbenchMassMessage(null);
    if (!isPromisePanel(panel)) {
      setPromiseGroup("");
      setPromiseSearch("");
      setPromiseSearchDraft("");
      setWorkbenchSection("");
      setWorkbenchSort("priority");
      setWorkbenchHideCompleted(false);
    } else if (panel === "followups") {
      setWorkbenchSection("");
      setWorkbenchSort("priority");
      setWorkbenchHideCompleted(false);
    } else if (panel === "workbench") {
      setPromiseGroup("");
    }
    setPage(1);
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      agingBucket,
      panel,
      panel === "followups" ? promiseGroup : "",
      isPromisePanel(panel) ? promiseSearch : "",
      panel === "workbench" ? workbenchSort : "priority",
      panel === "workbench" ? workbenchHideCompleted : false,
      panel === "workbench" ? workbenchSection : ""
    );
  }

  function applyPromiseGroup(nextGroup: PromiseGroupFilter) {
    if (!isOverdueInvoiceQueue(invoiceQueue) || collectionPanel !== "followups") {
      return;
    }

    setPromiseGroup(nextGroup);
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      agingBucket,
      "followups",
      nextGroup,
      promiseSearch
    );
  }

  function applyPromiseSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOverdueInvoiceQueue(invoiceQueue) || !isPromisePanel(collectionPanel)) {
      return;
    }

    const nextSearch = promiseSearchDraft.trim();
    setPromiseSearch(nextSearch);
    setPromiseSearchDraft(nextSearch);
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      agingBucket,
      collectionPanel,
      collectionPanel === "followups" ? promiseGroup : "",
      nextSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection
    );
  }

  function applyWorkbenchSection(nextSection: WorkbenchSectionFilter) {
    if (!isOverdueInvoiceQueue(invoiceQueue) || collectionPanel !== "workbench") {
      return;
    }

    setWorkbenchSection(nextSection);
    setWorkbenchSelectedIds([]);
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      agingBucket,
      "workbench",
      "",
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      nextSection
    );
  }

  function applyWorkbenchSort(nextSort: WorkbenchSortMode) {
    if (!isOverdueInvoiceQueue(invoiceQueue) || collectionPanel !== "workbench") {
      return;
    }

    setWorkbenchSort(nextSort);
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      agingBucket,
      "workbench",
      "",
      promiseSearch,
      nextSort,
      workbenchHideCompleted,
      workbenchSection
    );
  }

  function applyWorkbenchHideCompleted(nextHide: boolean) {
    if (!isOverdueInvoiceQueue(invoiceQueue) || collectionPanel !== "workbench") {
      return;
    }

    setWorkbenchHideCompleted(nextHide);
    setWorkbenchSelectedIds((current) =>
      nextHide
        ? current.filter((id) => {
            const match = workbenchCasesAll.find((item) => item.invoiceId === id);
            return match ? match.group !== "completed" : false;
          })
        : current
    );
    publishDiscovery(
      1,
      appliedFilters,
      "overdue",
      agingBucket,
      "workbench",
      "",
      promiseSearch,
      workbenchSort,
      nextHide,
      workbenchSection
    );
  }

  function toggleWorkbenchSelection(invoiceId: string) {
    setWorkbenchSelectedIds((current) =>
      current.includes(invoiceId)
        ? current.filter((id) => id !== invoiceId)
        : [...current, invoiceId]
    );
  }

  function toggleWorkbenchSelectAllVisible() {
    const visible = workbenchFilteredCases.map((item) => item.invoiceId);
    const allSelected =
      visible.length > 0 && visible.every((id) => workbenchSelectedIds.includes(id));
    setWorkbenchSelectedIds(allSelected ? [] : visible);
  }

  function runWorkbenchMassAction(action: WorkbenchMassActionId) {
    const selected = workbenchSelectedIds.filter((id) => workbenchVisibleIds.has(id));
    if (selected.length === 0) {
      setWorkbenchMassMessage(t("workbench.massSelectNone"));
      return;
    }

    const result = applyWorkbenchMassAction(selected, action);
    bumpPromiseRevision();
    setWorkbenchSelectedIds([]);
    const parts = [
      t("workbench.massUpdated", { count: result.okIds.length }),
      result.skippedIds.length ? t("workbench.massSkipped", { count: result.skippedIds.length }) : null,
      result.errorIds.length ? t("workbench.massErrors", { count: result.errorIds.length }) : null
    ].filter(Boolean);
    setWorkbenchMassMessage(parts.join(" · "));
  }

  function bumpPromiseRevision() {
    setPromiseRevision((value) => value + 1);
  }

  function openCaseHistory(invoiceId?: string | null) {
    if (!isOverdueInvoiceQueue(invoiceQueue)) {
      return;
    }
    if (invoiceId && invoiceId !== detailTargetId) {
      const invoice = invoices.find((row) => row.id === invoiceId);
      if (invoice) {
        beginViewInvoiceDetails(invoice);
      } else {
        onSelectedInvoiceIdChange?.(invoiceId);
      }
    }
    setCaseHistoryOpen(true);
    publishDiscovery(
      page,
      appliedFilters,
      "overdue",
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection,
      { open: true, type: caseHistoryType, search: caseHistorySearch, expanded: caseHistoryExpanded }
    );
  }

  function closeCaseHistory() {
    setCaseHistoryOpen(false);
    setCaseHistoryType("");
    setCaseHistorySearch("");
    setCaseHistorySearchDraft("");
    setCaseHistoryExpanded(false);
    publishDiscovery(
      page,
      appliedFilters,
      invoiceQueue,
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection,
      { open: false, type: "", search: "", expanded: false }
    );
  }

  function applyCaseHistoryType(nextType: CollectionActivityEventTypeFilter) {
    setCaseHistoryType(nextType);
    publishDiscovery(
      page,
      appliedFilters,
      "overdue",
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection,
      { open: true, type: nextType, search: caseHistorySearch, expanded: caseHistoryExpanded }
    );
  }

  function applyCaseHistorySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = caseHistorySearchDraft.trim();
    setCaseHistorySearch(nextSearch);
    setCaseHistorySearchDraft(nextSearch);
    publishDiscovery(
      page,
      appliedFilters,
      "overdue",
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection,
      { open: true, type: caseHistoryType, search: nextSearch, expanded: caseHistoryExpanded }
    );
  }

  function applyCaseHistoryExpanded(nextExpanded: boolean) {
    setCaseHistoryExpanded(nextExpanded);
    publishDiscovery(
      page,
      appliedFilters,
      "overdue",
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSort,
      workbenchHideCompleted,
      workbenchSection,
      { open: true, type: caseHistoryType, search: caseHistorySearch, expanded: nextExpanded }
    );
  }

  function openPromiseForm(existing: PromiseToPayRecord | null) {
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setPromiseFormOpen(true);
    setPromiseDateInput(existing?.promiseDate ?? "");
    setPromiseNoteInput(existing?.note ?? "");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closePromiseForm() {
    setPromiseFormOpen(false);
    setPromiseFormError(null);
  }

  function openResolutionForm() {
    setPromiseFormOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setResolutionOpen(true);
    setResolutionKind("");
    setResolutionPaymentDate("");
    setResolutionPaidAmount("");
    setResolutionRemainingAmount("");
    setResolutionPromiseDate("");
    setResolutionReason("");
    setResolutionNote("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeResolutionForm() {
    setResolutionOpen(false);
    setPromiseFormError(null);
  }

  function openContactForm(existing: PromiseToPayRecord | null) {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setContactOpen(true);
    setContactChannel("");
    setContactResult("");
    setContactNote("");
    setContactFollowUpAt(existing?.nextFollowUpAt ?? "");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeContactForm() {
    setContactOpen(false);
    setPromiseFormError(null);
  }

  function openRaiseDisputeForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setDisputeOpen(true);
    setDisputeEditMode(false);
    setDisputeCloseMode("");
    setDisputeReason("");
    setDisputeDescription("");
    setDisputeParty("");
    setDisputeReviewAt("");
    setDisputeCloseComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openEditDisputeForm(existing: PromiseToPayRecord | null) {
    const dispute = existing?.dispute;
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setDisputeOpen(true);
    setDisputeEditMode(true);
    setDisputeCloseMode("");
    setDisputeReason(dispute?.reason ?? "");
    setDisputeDescription(dispute?.description ?? "");
    setDisputeParty(dispute?.responsibleParty ?? "");
    setDisputeReviewAt(dispute?.nextReviewAt ?? "");
    setDisputeCloseComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openResolveDisputeForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setDisputeOpen(true);
    setDisputeEditMode(false);
    setDisputeCloseMode("resolve");
    setDisputeCloseComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openRejectDisputeForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setDisputeOpen(true);
    setDisputeEditMode(false);
    setDisputeCloseMode("reject");
    setDisputeCloseComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeDisputeForm() {
    setDisputeOpen(false);
    setDisputeEditMode(false);
    setDisputeCloseMode("");
    setPromiseFormError(null);
  }

  function openEscalateCaseForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setEscalationOpen(true);
    setEscalationEditMode(false);
    setEscalationCompleteMode(false);
    setEscalationReason("");
    setEscalationPriority("");
    setEscalationTeam("");
    setEscalationRequestedAction("");
    setEscalationDueDate("");
    setEscalationNote("");
    setEscalationCompleteComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openEditEscalationForm(existing: PromiseToPayRecord | null) {
    const escalation = existing?.escalation;
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setEscalationOpen(true);
    setEscalationEditMode(true);
    setEscalationCompleteMode(false);
    setEscalationReason(escalation?.reason ?? "");
    setEscalationPriority(escalation?.priority ?? "");
    setEscalationTeam(escalation?.responsibleTeam ?? "");
    setEscalationRequestedAction(escalation?.requestedAction ?? "");
    setEscalationDueDate(escalation?.dueDate ?? "");
    setEscalationNote("");
    setEscalationCompleteComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openCompleteEscalationForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setEscalationOpen(true);
    setEscalationEditMode(false);
    setEscalationCompleteMode(true);
    setEscalationCompleteComment("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeEscalationForm() {
    setEscalationOpen(false);
    setEscalationEditMode(false);
    setEscalationCompleteMode(false);
    setPromiseFormError(null);
  }

  function openAddNoteForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setNotesOpen(true);
    setNotesEditId("");
    setNoteBody("");
    setNoteAuthor(readLastCollectionNoteAuthor());
    setNoteCategory(
      NOTE_CATEGORY_OPTIONS.find((option) => option.id === "general")?.id ?? "general"
    );
    setNotePinned(false);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openEditNoteForm(noteId: string) {
    const note = detailPromiseRecord?.notes.find((item) => item.id === noteId);
    if (!note) {
      return;
    }
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setNotesOpen(true);
    setNotesEditId(note.id);
    setNoteBody(note.body);
    setNoteAuthor(note.author);
    setNoteCategory(note.category);
    setNotePinned(note.pinned);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeNotesForm() {
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setPromiseFormError(null);
  }

  function handleSaveNote(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const input = {
      body: noteBody,
      author: noteAuthor,
      category: noteCategory,
      pinned: notePinned
    };
    const result = notesEditId
      ? updateCollectionNote(invoiceId, { ...input, noteId: notesEditId })
      : addCollectionNote(invoiceId, input);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(notesEditId ? t("promise.msg.noteUpdated") : t("promise.msg.noteSaved"));
    closeNotesForm();
    bumpPromiseRevision();
  }

  function handleArchiveNote(invoiceId: string, noteId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = archiveCollectionNote(invoiceId, noteId);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    if (notesEditId === noteId) {
      closeNotesForm();
    }
    setPromiseFormSuccess(t("promise.msg.noteArchived"));
    bumpPromiseRevision();
  }

  function openAddReminderForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setRemindersOpen(true);
    setRemindersEditId("");
    setReminderTitle("");
    setReminderNote("");
    setReminderKind("callback");
    setReminderDueDate("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openEditReminderForm(reminderId: string) {
    const reminder = detailPromiseRecord?.reminders.find((item) => item.id === reminderId);
    if (!reminder || reminder.status !== "open") {
      return;
    }
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    setRemindersOpen(true);
    setRemindersEditId(reminder.id);
    setReminderTitle(reminder.title);
    setReminderNote(reminder.note);
    setReminderKind(reminder.kind);
    setReminderDueDate(reminder.dueDate);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeRemindersForm() {
    setRemindersOpen(false);
    setRemindersEditId("");
    setPromiseFormError(null);
  }

  function handleSaveReminder(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const input = {
      title: reminderTitle,
      note: reminderNote,
      kind: reminderKind,
      dueDate: reminderDueDate
    };
    const result = remindersEditId
      ? updateCollectionReminder(invoiceId, {
          ...input,
          reminderId: remindersEditId
        })
      : createCollectionReminder(invoiceId, input);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      remindersEditId ? t("promise.msg.reminderUpdated") : t("promise.msg.reminderScheduled")
    );
    closeRemindersForm();
    bumpPromiseRevision();
  }

  function handleCompleteReminder(invoiceId: string, reminderId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = completeCollectionReminder(invoiceId, reminderId);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    if (remindersEditId === reminderId) {
      closeRemindersForm();
    }
    setPromiseFormSuccess(t("promise.msg.reminderCompleted"));
    bumpPromiseRevision();
  }

  function handleCancelReminder(invoiceId: string, reminderId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = cancelCollectionReminder(invoiceId, reminderId);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    if (remindersEditId === reminderId) {
      closeRemindersForm();
    }
    setPromiseFormSuccess(t("promise.msg.reminderCancelled"));
    bumpPromiseRevision();
  }

  function resetAttachmentFileFields() {
    setAttachmentFileName("");
    setAttachmentContentType("");
    setAttachmentSizeBytes(0);
    setAttachmentContentDataUrl("");
  }

  function openAddAttachmentForm() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(true);
    setAttachmentsEditId("");
    resetAttachmentFileFields();
    setAttachmentCategory("payment_proof");
    setAttachmentDescription("");
    setAttachmentUploadedBy(readLastCollectionAttachmentAuthor() || "");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openEditAttachmentForm(attachmentId: string) {
    const attachment = detailPromiseRecord?.attachments.find(
      (item) => item.id === attachmentId
    );
    if (!attachment || attachment.archivedAtUtc) {
      return;
    }
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(true);
    setAttachmentsEditId(attachment.id);
    setAttachmentFileName(attachment.fileName);
    setAttachmentContentType(attachment.contentType);
    setAttachmentSizeBytes(attachment.sizeBytes);
    setAttachmentContentDataUrl("");
    setAttachmentCategory(attachment.category);
    setAttachmentDescription(attachment.description);
    setAttachmentUploadedBy(attachment.uploadedBy);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closeAttachmentsForm() {
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
    resetAttachmentFileFields();
    setPromiseFormError(null);
  }

  function handleAttachmentFileSelected(file: File | null) {
    if (!file) {
      resetAttachmentFileFields();
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setPromiseFormError(
        t("promise.msg.attachmentTooLarge", {
          size: (ATTACHMENT_MAX_BYTES / 1024).toFixed(0)
        })
      );
      resetAttachmentFileFields();
      return;
    }
    setPromiseBusy(true);
    setPromiseFormError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setAttachmentFileName(file.name);
      setAttachmentContentType(file.type || "application/octet-stream");
      setAttachmentSizeBytes(file.size);
      setAttachmentContentDataUrl(result);
      setPromiseBusy(false);
    };
    reader.onerror = () => {
      setPromiseBusy(false);
      setPromiseFormError(t("promise.msg.attachmentReadFailed"));
      resetAttachmentFileFields();
    };
    reader.readAsDataURL(file);
  }

  function handleSaveAttachment(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const input = {
      fileName: attachmentFileName,
      contentType: attachmentContentType,
      sizeBytes: attachmentSizeBytes,
      category: attachmentCategory,
      description: attachmentDescription,
      uploadedBy: attachmentUploadedBy,
      contentDataUrl: attachmentContentDataUrl
    };
    const result = attachmentsEditId
      ? updateCollectionAttachment(invoiceId, {
          ...input,
          attachmentId: attachmentsEditId,
          replaceContent: Boolean(attachmentContentDataUrl.trim())
        })
      : addCollectionAttachment(invoiceId, input);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      attachmentsEditId ? t("promise.msg.attachmentUpdated") : t("promise.msg.attachmentSaved")
    );
    closeAttachmentsForm();
    bumpPromiseRevision();
  }

  function handleArchiveAttachment(invoiceId: string, attachmentId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = archiveCollectionAttachment(invoiceId, attachmentId);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    if (attachmentsEditId === attachmentId) {
      closeAttachmentsForm();
    }
    setPromiseFormSuccess(t("promise.msg.attachmentArchived"));
    bumpPromiseRevision();
  }

  function closeOtherCollectionFormsForPaymentPlan() {
    setPromiseFormOpen(false);
    setResolutionOpen(false);
    setContactOpen(false);
    setDisputeOpen(false);
    setEscalationOpen(false);
    setNotesOpen(false);
    setNotesEditId("");
    setRemindersOpen(false);
    setRemindersEditId("");
    setAttachmentsOpen(false);
    setAttachmentsEditId("");
  }

  function openCreatePaymentPlanForm() {
    closeOtherCollectionFormsForPaymentPlan();
    setPaymentPlanOpen(true);
    setPaymentPlanEditMode(false);
    setPaymentPlanCancelMode(false);
    setPaymentPlanRecordMode(false);
    setPaymentPlanAmount(detailInvoice ? String(detailInvoice.totalAmount) : "");
    setPaymentPlanInstallments([
      emptyInstallmentDraft(),
      emptyInstallmentDraft(),
      emptyInstallmentDraft()
    ]);
    setPaymentPlanReplacePromise(Boolean(detailPromiseRecord));
    setPaymentPlanCancelReason("");
    setPaymentPlanRecordInstallmentId("");
    setPaymentPlanRecordAmount("");
    setPaymentPlanRecordNote("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openEditPaymentPlanForm(existing: PromiseToPayRecord | null) {
    const plan = existing?.paymentPlan;
    if (!plan || plan.status !== "Active") {
      return;
    }
    closeOtherCollectionFormsForPaymentPlan();
    setPaymentPlanOpen(true);
    setPaymentPlanEditMode(true);
    setPaymentPlanCancelMode(false);
    setPaymentPlanRecordMode(false);
    setPaymentPlanAmount(String(plan.planAmount));
    setPaymentPlanInstallments(
      plan.installments.map((item) => ({
        id: item.id,
        dueDate: item.dueDate,
        expectedAmount: item.expectedAmount,
        recordedPaidAmount: item.recordedPaidAmount
      }))
    );
    setPaymentPlanReplacePromise(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openCancelPaymentPlanForm() {
    closeOtherCollectionFormsForPaymentPlan();
    setPaymentPlanOpen(true);
    setPaymentPlanEditMode(false);
    setPaymentPlanCancelMode(true);
    setPaymentPlanRecordMode(false);
    setPaymentPlanCancelReason("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function openRecordInstallmentPaymentForm(installmentId: string) {
    closeOtherCollectionFormsForPaymentPlan();
    setPaymentPlanOpen(true);
    setPaymentPlanEditMode(false);
    setPaymentPlanCancelMode(false);
    setPaymentPlanRecordMode(true);
    setPaymentPlanRecordInstallmentId(installmentId);
    setPaymentPlanRecordAmount("");
    setPaymentPlanRecordNote("");
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
  }

  function closePaymentPlanForm() {
    setPaymentPlanOpen(false);
    setPaymentPlanEditMode(false);
    setPaymentPlanCancelMode(false);
    setPaymentPlanRecordMode(false);
    setPromiseFormError(null);
  }

  function handleSavePaymentPlan(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const currency = detailInvoice?.currency?.trim() || "UAH";
    const result = paymentPlanEditMode
      ? updatePaymentPlan(invoiceId, {
          planAmount: paymentPlanAmount,
          installments: paymentPlanInstallments
        })
      : createPaymentPlan(invoiceId, {
          planAmount: paymentPlanAmount,
          currency,
          originalInvoiceAmount: detailInvoice?.totalAmount ?? null,
          installments: paymentPlanInstallments,
          replaceActivePromise: paymentPlanReplacePromise
        });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      paymentPlanEditMode
        ? t("promise.msg.planUpdated")
        : t("promise.msg.planCreated", {
              amount: result.record.paymentPlan?.planAmount.toFixed(2),
              currency: result.record.paymentPlan?.currency
            })
    );
    closePaymentPlanForm();
    bumpPromiseRevision();
  }

  function handleConfirmCancelPaymentPlan(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = cancelPaymentPlan(invoiceId, { reason: paymentPlanCancelReason });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(t("promise.msg.planCancelled"));
    closePaymentPlanForm();
    bumpPromiseRevision();
  }

  function handleConfirmRecordInstallmentPayment(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = recordInstallmentPayment(invoiceId, {
      installmentId: paymentPlanRecordInstallmentId,
      amount: paymentPlanRecordAmount,
      note: paymentPlanRecordNote
    });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    const status = result.record.paymentPlan?.status;
    setPromiseFormSuccess(
      status === "Completed"
        ? t("promise.msg.paymentRecordedPlanCompleted")
        : t("promise.msg.paymentRecorded")
    );
    closePaymentPlanForm();
    bumpPromiseRevision();
  }

  function handleSavePromise(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = savePromiseToPay(
      invoiceId,
      { promiseDate: promiseDateInput, note: promiseNoteInput },
      { preserveStatus: true }
    );
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(t("promise.msg.promiseSaved", { date: result.record.promiseDate }));
    setPromiseFormOpen(false);
    bumpPromiseRevision();
  }

  function handlePromiseStatus(invoiceId: string, status: PromiseToPayRecord["status"]) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = updatePromiseStatus(invoiceId, status);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(t("promise.msg.followUpStatus", { status: promiseStatusLabel(result.record.status) }));
    bumpPromiseRevision();
  }

  function handleSaveResolution(invoiceId: string) {
    if (!resolutionKind) {
      setPromiseFormError(t("promise.msg.selectResolutionKind"));
      return;
    }
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = applyCollectionResolution(invoiceId, {
      kind: resolutionKind,
      paymentDate: resolutionPaymentDate,
      paidAmount: resolutionPaidAmount,
      remainingAmount: resolutionRemainingAmount,
      promiseDate: resolutionPromiseDate,
      reason: resolutionReason,
      note: resolutionNote
    });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(t("promise.msg.resolutionSaved", {
        kind: result.record.resolution
          ? resolutionKindLabel(result.record.resolution.kind)
          : ""
      }));
    setResolutionOpen(false);
    bumpPromiseRevision();
  }

  function handleSaveContact(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = saveCollectionContact(invoiceId, {
      channel: contactChannel,
      result: contactResult,
      note: contactNote,
      followUpAt: contactFollowUpAt
    });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      result.record.nextFollowUpAt
        ? t("promise.msg.contactSavedWithFollowUp", {
            date: result.record.nextFollowUpAt
          })
        : t("promise.msg.contactSaved")
    );
    setContactOpen(false);
    setContactChannel("");
    setContactResult("");
    setContactNote("");
    setContactFollowUpAt("");
    bumpPromiseRevision();
    if (result.needsPromise) {
      openPromiseForm(result.record);
      setPromiseFormSuccess(
        t("promise.msg.contactSavedNeedsPromise")
      );
    }
  }

  function handleClearFollowUp(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = updateContactFollowUp(invoiceId, null);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setContactFollowUpAt("");
    setPromiseFormSuccess(t("promise.msg.followUpCleared"));
    bumpPromiseRevision();
  }

  function handleSaveDispute(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const input = {
      reason: disputeReason,
      description: disputeDescription,
      responsibleParty: disputeParty,
      nextReviewAt: disputeReviewAt
    };
    const result = disputeEditMode
      ? updateCollectionDispute(invoiceId, input)
      : raiseCollectionDispute(invoiceId, input);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      disputeEditMode
        ? t("promise.msg.disputeUpdated")
        : result.record.dispute?.nextReviewAt
          ? t("promise.msg.disputeRaisedWithReview", {
              date: result.record.dispute.nextReviewAt
            })
          : t("promise.msg.disputeRaised")
    );
    setDisputeOpen(false);
    setDisputeEditMode(false);
    setDisputeCloseMode("");
    bumpPromiseRevision();
  }

  function handleConfirmCloseDispute(invoiceId: string) {
    if (!disputeCloseMode) {
      setPromiseFormError(t("promise.msg.selectResolveOrReject"));
      return;
    }
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result =
      disputeCloseMode === "resolve"
        ? resolveCollectionDispute(invoiceId, { comment: disputeCloseComment })
        : rejectCollectionDispute(invoiceId, { comment: disputeCloseComment });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      disputeCloseMode === "resolve" ? t("promise.msg.disputeResolved")
        : t("promise.msg.disputeRejected")
    );
    setDisputeOpen(false);
    setDisputeCloseMode("");
    setDisputeCloseComment("");
    bumpPromiseRevision();
  }

  function handleSaveEscalation(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const input = {
      reason: escalationReason,
      priority: escalationPriority,
      responsibleTeam: escalationTeam,
      requestedAction: escalationRequestedAction,
      dueDate: escalationDueDate,
      note: escalationNote
    };
    const result = escalationEditMode
      ? updateCollectionEscalation(invoiceId, input)
      : raiseCollectionEscalation(invoiceId, input);
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(
      escalationEditMode
        ? t("promise.msg.escalationUpdated")
        : t("promise.msg.escalationCreated", {
            date: result.record.escalation?.dueDate
          })
    );
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setEscalationEditMode(false);
    setEscalationCompleteMode(false);
    bumpPromiseRevision();
  }

  function handleConfirmCompleteEscalation(invoiceId: string) {
    setPromiseBusy(true);
    setPromiseFormError(null);
    setPromiseFormSuccess(null);
    const result = completeCollectionEscalation(invoiceId, {
      comment: escalationCompleteComment
    });
    setPromiseBusy(false);
    if (!result.ok) {
      setPromiseFormError(result.error);
      return;
    }
    setPromiseFormSuccess(t("promise.msg.escalationCompleted"));
    setEscalationOpen(false);
    setPaymentPlanOpen(false);
    setEscalationCompleteMode(false);
    setEscalationCompleteComment("");
    bumpPromiseRevision();
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>{t("invoices.title")}</h1>
        <p className="lede">
          {t("invoices.lede")}
        </p>
      </header>

      <Panel
        title={t("invoices.panelTitle")}
        headingId="invoices-heading"
        actions={
          <button
            type="button"
            onClick={() => workspace && void loadPage(workspace.id, page, appliedFilters, invoiceQueue)}
            disabled={!workspace || loading}
          >
            {t("refresh", { ns: "common" })}
          </button>
        }
      >
        {!workspace ? (
          <StatusMessage>{t("invoices.needWorkspace")}</StatusMessage>
        ) : (
          <>
            <p className="meta">
              Workspace: {workspace.name} · <span className="mono">{workspace.id}</span>
            </p>

            <div
              className="list-shortcuts"
              role="group"
              aria-label={t("invoices.quickFilterAria")}
            >
              <p className="list-shortcuts-label">{t("dashboard.quickFilterLabel")}</p>
              <div className="list-shortcuts-row">
                <button
                  type="button"
                  className={
                    draftFilterActive
                      ? "list-shortcut list-shortcut--active"
                      : "list-shortcut"
                  }
                  title={t("invoices.shortcutTitle.drafts")}
                  aria-pressed={draftFilterActive}
                  disabled={loading}
                  onClick={applyDraftInvoicesFilter}
                >
                  {t("invoices.shortcut.drafts")}
                </button>
                <button
                  type="button"
                  className={
                    issuedFilterActive
                      ? "list-shortcut list-shortcut--active"
                      : "list-shortcut"
                  }
                  title={t("invoices.shortcutTitle.issued")}
                  aria-pressed={issuedFilterActive}
                  disabled={loading}
                  onClick={applyIssuedInvoicesFilter}
                >
                  {t("invoices.shortcut.issued")}
                </button>
                <button
                  type="button"
                  className={
                    overdueFilterActive
                      ? "list-shortcut list-shortcut--attention list-shortcut--active"
                      : "list-shortcut list-shortcut--attention"
                  }
                  title={t("invoices.shortcutTitle.collections")}
                  aria-pressed={overdueFilterActive}
                  disabled={loading}
                  onClick={applyOverdueIssuedInvoicesFilter}
                >
                  {t("invoices.shortcut.collections")}
                </button>
              </div>
              <p className="meta">
                {t("invoices.shortcutHelp")}
              </p>
            </div>

            {overdueQueueActive ? (
              <div className="queue-banner" role="status">
                <p className="queue-banner-title">{t("collections.bannerTitle")}</p>
                <p className="meta">
                  {t("collections.serverFilterLabel")} <span className="mono">status=Issued</span>
                  {t("collections.serverFilterDueTo")}{" "}
                  <span className="mono">{effectiveDueToForSummary}</span>{" "}
                  {t("collections.serverFilterNote")} {t("collections.settledHiddenNote")}
                </p>
                <div
                  className="aging-bucket-row"
                  role="group"
                  aria-label={t("collections.panelsAria")}
                >
                  <button
                    type="button"
                    className={
                      queueTableActive
                        ? "list-shortcut list-shortcut--active"
                        : "list-shortcut"
                    }
                    aria-pressed={queueTableActive}
                    disabled={loading}
                    onClick={() => applyCollectionPanel("")}
                  >
                    {t("collections.panel.queue")}
                  </button>
                  <button
                    type="button"
                    className={
                      workbenchPanelActive
                        ? "list-shortcut list-shortcut--attention list-shortcut--active"
                        : "list-shortcut list-shortcut--attention"
                    }
                    aria-pressed={workbenchPanelActive}
                    disabled={loading}
                    onClick={() => applyCollectionPanel("workbench")}
                  >
                    {t("collections.panel.workbench")}
                  </button>
                  <button
                    type="button"
                    className={
                      followUpsPanelActive
                        ? "list-shortcut list-shortcut--attention list-shortcut--active"
                        : "list-shortcut list-shortcut--attention"
                    }
                    aria-pressed={followUpsPanelActive}
                    disabled={loading}
                    onClick={() => applyCollectionPanel("followups")}
                  >
                    {t("collections.panel.followups")}
                  </button>
                </div>
                {queueTableActive && collectionsSummary ? (
                  <>
                    <dl className="collections-summary facts collections-kpi">
                      <div>
                        <dt>{t("collections.kpi.openAttention")}</dt>
                        <dd>
                          {collectionsSummary.openCount}
                          <span className="collections-kpi-amount">
                            {formatTotals(collectionsSummary.openTotalsByCurrency)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("collections.kpi.settledInQueue")}</dt>
                        <dd>
                          {collectionsSummary.settledCount}
                          <span className="collections-kpi-amount">
                            {formatTotals(collectionsSummary.settledTotalsByCurrency)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("collections.kpi.totalOverdue")}</dt>
                        <dd>
                          {collectionsSummary.overdueCount}
                          <span className="collections-kpi-amount">
                            {formatTotals(collectionsSummary.overdueTotalsByCurrency)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("collections.kpi.totalDueToday")}</dt>
                        <dd>
                          {collectionsSummary.dueTodayCount}
                          <span className="collections-kpi-amount">
                            {formatTotals(collectionsSummary.dueTodayTotalsByCurrency)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("collections.kpi.openOutstanding")}</dt>
                        <dd>
                          {formatTotals(collectionsSummary.outstandingTotalsByCurrency)}
                          {agingBucket ? (
                            <span className="collections-kpi-amount">
                              {collectionsSummary.bucketLabel} · {collectionsSummary.bucketCount}
                            </span>
                          ) : (
                            <span className="collections-kpi-amount">
                              {queueHideSettled
                                ? t("collections.kpi.openCount", { count: collectionsSummary.openCount })
                                : t("collections.kpi.calendarCount", {
                            count: collectionsSummary.attentionCount
                          })}
                            </span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div
                      className="aging-bucket-row"
                      role="group"
                      aria-label={t("collections.settlementAria")}
                    >
                      <button
                        type="button"
                        className={
                          queueHideSettled
                            ? "list-shortcut list-shortcut--active"
                            : "list-shortcut"
                        }
                        aria-pressed={queueHideSettled}
                        disabled={loading}
                        onClick={() => applyQueueHideSettled(true)}
                      >
                        {t("collections.hideSettled")}
                      </button>
                      <button
                        type="button"
                        className={
                          !queueHideSettled
                            ? "list-shortcut list-shortcut--active"
                            : "list-shortcut"
                        }
                        aria-pressed={!queueHideSettled}
                        disabled={loading}
                        onClick={() => applyQueueHideSettled(false)}
                      >
                        {t("collections.showSettled")}
                      </button>
                      <span className="meta">
                        {queueHideSettled
                          ? t("collections.showingOpen", { count: collectionsSummary.openCount })
                          : t("collections.showingAll", { count: collectionsSummary.bucketCount })}
                      </span>
                    </div>
                  </>
                ) : null}
                {workbenchPanelActive && workbenchKpi ? (
                  <dl className="collections-summary facts collections-kpi">
                    <div>
                      <dt>{t("workbench.kpi.activeCases")}</dt>
                      <dd>{workbenchKpi.activeCollectionCases}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.dueToday")}</dt>
                      <dd>{workbenchKpi.dueTodayCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.broken")}</dt>
                      <dd>{workbenchKpi.brokenCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.escalated")}</dt>
                      <dd>{workbenchKpi.escalatedCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.disputed")}</dt>
                      <dd>{workbenchKpi.disputedCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.paymentPlans")}</dt>
                      <dd>{workbenchKpi.paymentPlanCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.handoffs")}</dt>
                      <dd>{workbenchKpi.handoffCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.remindersDue")}</dt>
                      <dd>{workbenchKpi.reminderDueCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.evidence")}</dt>
                      <dd>{workbenchKpi.evidenceCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.completedToday")}</dt>
                      <dd>{workbenchKpi.completedTodayCount}</dd>
                    </div>
                  </dl>
                ) : null}
                {followUpsPanelActive && promiseSummary ? (
                  <dl className="collections-summary facts collections-kpi">
                    <div>
                      <dt>{t("promise.kpi.completed")}</dt>
                      <dd>{promiseSummary.completedCount}</dd>
                    </div>
                    <div>
                      <dt>{t("workbench.kpi.broken")}</dt>
                      <dd>{promiseSummary.brokenCount}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.kpi.resolvedToday")}</dt>
                      <dd>{promiseSummary.resolvedTodayCount}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.kpi.escalated")}</dt>
                      <dd>{promiseSummary.escalatedCount}</dd>
                    </div>
                    <div>
                      <dt>{t("promise.kpi.disputed")}</dt>
                      <dd>{promiseSummary.disputedCount}</dd>
                    </div>
                  </dl>
                ) : null}
                {totalCount > invoices.length ? (
                  <p className="meta">
                    {t("collections.loadedTruncated", {
                      loaded: invoices.length,
                      total: totalCount,
                      limit: COLLECTIONS_PAGE_SIZE
                    })}
                  </p>
                ) : null}
                {queueTableActive ? (
                  <div
                    className="aging-bucket-row"
                    role="group"
                    aria-label={t("collections.agingAria")}
                  >
                    {AGING_BUCKET_OPTIONS.map((option) => (
                      <button
                        key={option.id || "all"}
                        type="button"
                        className={
                          agingBucket === option.id
                            ? "list-shortcut list-shortcut--active"
                            : "list-shortcut"
                        }
                        aria-pressed={agingBucket === option.id}
                        disabled={loading}
                        onClick={() => applyAgingBucket(option.id)}
                      >
                        {t(agingBucketShortKey(option.id))}
                      </button>
                    ))}
                  </div>
                ) : null}
                {followUpsPanelActive ? (
                  <>
                    <div
                      className="aging-bucket-row"
                      role="group"
                      aria-label={t("promise.groupsAria")}
                    >
                      {PROMISE_GROUP_OPTIONS.map((option) => (
                        <button
                          key={option.id || "all-followups"}
                          type="button"
                          className={
                            promiseGroup === option.id
                              ? "list-shortcut list-shortcut--active"
                              : "list-shortcut"
                          }
                          aria-pressed={promiseGroup === option.id}
                          disabled={loading}
                          onClick={() => applyPromiseGroup(option.id)}
                        >
                          {t(promiseGroupShortKey(option.id))}
                        </button>
                      ))}
                    </div>
                    <form className="filter-form promise-search-form" onSubmit={applyPromiseSearch}>
                      <label>
                        {t("promise.searchLabel")}
                        <input
                          value={promiseSearchDraft}
                          onChange={(event) => setPromiseSearchDraft(event.target.value)}
                          placeholder={t("promise.searchPlaceholder")}
                          autoComplete="off"
                        />
                      </label>
                      <div className="filter-actions">
                        <button type="submit" disabled={loading}>
                          {t("invoices.findAction")}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={loading}
                          onClick={() => {
                            setPromiseSearchDraft("");
                            setPromiseSearch("");
                            publishDiscovery(
                              1,
                              appliedFilters,
                              "overdue",
                              agingBucket,
                              "followups",
                              promiseGroup,
                              ""
                            );
                          }}
                        >
                          {t("invoices.resetSearch")}
                        </button>
                      </div>
                    </form>
                  </>
                ) : null}
                {workbenchPanelActive ? (
                  <>
                    <div
                      className="aging-bucket-row"
                      role="group"
                      aria-label={t("workbench.sectionsAria")}
                    >
                      {WORKBENCH_SECTION_OPTIONS.map((option) => (
                        <button
                          key={option.id || "all-workbench"}
                          type="button"
                          className={
                            workbenchSection === option.id
                              ? "list-shortcut list-shortcut--active"
                              : "list-shortcut"
                          }
                          aria-pressed={workbenchSection === option.id}
                          disabled={loading}
                          onClick={() => applyWorkbenchSection(option.id)}
                        >
                          {t(workbenchSectionShortKey(option.id))}
                        </button>
                      ))}
                    </div>
                    <form className="filter-form promise-search-form" onSubmit={applyPromiseSearch}>
                      <label>
                        {t("workbench.searchLabel")}
                        <input
                          value={promiseSearchDraft}
                          onChange={(event) => setPromiseSearchDraft(event.target.value)}
                          placeholder={t("workbench.searchPlaceholder")}
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        {t("workbench.sortLabel")}
                        <select
                          value={workbenchSort}
                          onChange={(event) =>
                            applyWorkbenchSort(event.target.value as WorkbenchSortMode)
                          }
                        >
                          {WORKBENCH_SORT_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {t(workbenchSortKey(option.id))}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="filter-actions">
                        <button type="submit" disabled={loading}>
                          {t("invoices.findAction")}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={loading}
                          onClick={() => {
                            setPromiseSearchDraft("");
                            setPromiseSearch("");
                            publishDiscovery(
                              1,
                              appliedFilters,
                              "overdue",
                              agingBucket,
                              "workbench",
                              "",
                              "",
                              workbenchSort,
                              workbenchHideCompleted,
                              workbenchSection
                            );
                          }}
                        >
                          {t("invoices.resetSearch")}
                        </button>
                        <button
                          type="button"
                          className={
                            workbenchHideCompleted
                              ? "list-shortcut list-shortcut--active"
                              : "list-shortcut"
                          }
                          aria-pressed={workbenchHideCompleted}
                          disabled={loading}
                          onClick={() => applyWorkbenchHideCompleted(!workbenchHideCompleted)}
                        >
                          {t("workbench.hideCompleted")}
                        </button>
                      </div>
                    </form>
                    <div
                      className="aging-bucket-row workbench-mass-actions"
                      role="group"
                      aria-label={t("workbench.massActionsAria")}
                    >
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={loading || workbenchSelectedIds.length === 0}
                        onClick={() => runWorkbenchMassAction("mark_contacted")}
                      >
                        {t("workbench.massAction.markContacted")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={loading || workbenchSelectedIds.length === 0}
                        onClick={() => runWorkbenchMassAction("mark_follow_up_required")}
                      >
                        {t("workbench.massAction.markFollowUp")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={loading || workbenchSelectedIds.length === 0}
                        onClick={() => runWorkbenchMassAction("complete")}
                      >
                        {t("workbench.massAction.complete")}
                      </button>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={loading}
                        onClick={() => applyWorkbenchHideCompleted(true)}
                      >
                        {t("workbench.hideCompleted")}
                      </button>
                    </div>
                    {workbenchMassMessage ? (
                      <p className="meta" role="status">
                        {workbenchMassMessage}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            <form className="filter-form" onSubmit={applyFilters}>
              <label>
                {t("invoices.field.documentNumber")}
                <input
                  value={draftFilters.documentNumber ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      documentNumber: event.target.value
                    }))
                  }
                  placeholder="INV-20260724-001"
                  autoComplete="off"
                />
              </label>
              <label>
                {t("invoices.field.counterparty")}
                <input
                  value={draftFilters.counterpartyReference ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      counterpartyReference: event.target.value
                    }))
                  }
                  placeholder={t("invoices.counterpartyPlaceholder")}
                  autoComplete="off"
                  title={t("invoices.counterpartyTitle")}
                />
              </label>
              <label>
                {t("field.status")}
                <select
                  value={draftFilters.status ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: event.target.value as InvoiceStatusFilter
                    }))
                  }
                >
                  <option value="">{t("all", { ns: "common" })}</option>
                  {INVOICE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("invoices.field.createdFrom")}
                <input
                  type="date"
                  value={draftFilters.createdFromDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      createdFromDate: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                {t("invoices.field.createdTo")}
                <input
                  type="date"
                  value={draftFilters.createdToDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      createdToDate: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                {t("invoices.field.issuedFrom")}
                <input
                  type="date"
                  value={draftFilters.issuedFromDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      issuedFromDate: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                {t("invoices.field.issuedTo")}
                <input
                  type="date"
                  value={draftFilters.issuedToDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      issuedToDate: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                {t("invoices.field.dueFrom")}
                <input
                  type="date"
                  value={draftFilters.dueFromDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      dueFromDate: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                {t("invoices.field.dueTo")}
                <input
                  type="date"
                  value={draftFilters.dueToDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      dueToDate: event.target.value
                    }))
                  }
                />
              </label>
              <div className="filter-actions">
                <button type="submit" disabled={loading}>
                  {t("invoices.applyAction")}
                </button>
                <button type="button" onClick={clearFilters} disabled={loading}>
                  {overdueQueueActive ? t("invoices.clearQueue") : t("clearFilter", { ns: "common" })}
                </button>
              </div>
            </form>

            {filterValidationError ? (
              <StatusMessage tone="error">{filterValidationError}</StatusMessage>
            ) : null}
            {filtersActive ? (
              <p className="meta">
                {t("invoices.filter.activePrefix")}
                {overdueQueueActive ? t("invoices.filter.activeQueue") : ""}
                {overdueQueueActive && agingBucket
                  ? t("invoices.filter.activeAging", {
                        bucket: agingBucketLabel(agingBucket)
                      })
                  : ""}
                {appliedFilters.documentNumber?.trim()
                  ? t("invoices.filter.activeDocumentNumber", {
                        value: appliedFilters.documentNumber.trim()
                      })
                  : ""}
                {appliedFilters.counterpartyReference?.trim()
                  ? t("invoices.filter.activeCounterparty", {
                        value: appliedFilters.counterpartyReference.trim()
                      })
                  : ""}
                {appliedFilters.status === "Draft" || appliedFilters.status === "Issued"
                  ? t("invoices.filter.activeStatus", {
                        value: statusLabel(appliedFilters.status)
                      })
                  : ""}
                {appliedFilters.createdFromDate
                  ? t("invoices.filter.activeCreatedFrom", {
                        value: appliedFilters.createdFromDate
                      })
                  : ""}
                {appliedFilters.createdToDate
                  ? t("invoices.filter.activeCreatedTo", {
                        value: appliedFilters.createdToDate
                      })
                  : ""}
                {appliedFilters.issuedFromDate
                  ? t("invoices.filter.activeIssuedFrom", {
                        value: appliedFilters.issuedFromDate
                      })
                  : ""}
                {appliedFilters.issuedToDate
                  ? t("invoices.filter.activeIssuedTo", {
                        value: appliedFilters.issuedToDate
                      })
                  : ""}
                {appliedFilters.dueFromDate
                  ? t("invoices.filter.activeDueFrom", {
                        value: appliedFilters.dueFromDate
                      })
                  : ""}
                {effectiveDueToForSummary
                  ? t("invoices.filter.activeDueTo", { value: effectiveDueToForSummary })
                  : ""}
              </p>
            ) : (
              <p className="meta">{t("invoices.filter.none")}</p>
            )}

            <form className="create-form" onSubmit={(event) => void handleCreateInvoice(event)}>
              <label>
                {t("invoices.field.documentNumber")}
                <input
                  value={documentNumber}
                  onChange={(event) => {
                    setDocumentNumber(event.target.value);
                    setCreateSuccess(null);
                  }}
                  placeholder="INV-20260724-001"
                  required
                />
              </label>
              <label>
                {t("invoices.field.counterparty")}
                <input
                  value={counterpartyReference}
                  onChange={(event) => {
                    setCounterpartyReference(event.target.value);
                    setCreateSuccess(null);
                  }}
                  required
                />
              </label>
              <label>
                {t("invoices.field.currency")}
                <input
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value.toUpperCase());
                    setCreateSuccess(null);
                  }}
                  maxLength={3}
                  required
                />
              </label>
              <button type="submit" disabled={createBusy}>
                {t("invoices.createDraft")}
              </button>
            </form>
          </>
        )}

        {createError ? <StatusMessage tone="error">{createError}</StatusMessage> : null}
        {createSuccess ? <StatusMessage tone="success">{createSuccess}</StatusMessage> : null}
        {lineAddError ? <StatusMessage tone="error">{lineAddError}</StatusMessage> : null}
        {lineAddSuccess ? <StatusMessage tone="success">{lineAddSuccess}</StatusMessage> : null}
        {lineUpdateError ? (
          <StatusMessage tone="error">{lineUpdateError}</StatusMessage>
        ) : null}
        {lineUpdateSuccess ? (
          <StatusMessage tone="success">{lineUpdateSuccess}</StatusMessage>
        ) : null}
        {lineRemoveError ? (
          <StatusMessage tone="error">{lineRemoveError}</StatusMessage>
        ) : null}
        {lineRemoveSuccess ? (
          <StatusMessage tone="success">{lineRemoveSuccess}</StatusMessage>
        ) : null}
        {dueDateEditError ? (
          <StatusMessage tone="error">{dueDateEditError}</StatusMessage>
        ) : null}
        {dueDateEditSuccess ? (
          <StatusMessage tone="success">{dueDateEditSuccess}</StatusMessage>
        ) : null}
        {headerEditError && !headerEditTarget ? (
          <StatusMessage tone="error">{headerEditError}</StatusMessage>
        ) : null}
        {headerEditSuccess ? (
          <StatusMessage tone="success">{headerEditSuccess}</StatusMessage>
        ) : null}
        {createAccrualError && !createAccrualTarget ? (
          <StatusMessage tone="error">{createAccrualError}</StatusMessage>
        ) : null}
        {createAccrualSuccess ? (
          <div className="state-actions">
            <StatusMessage tone="success">{createAccrualSuccess}</StatusMessage>
            {createdAccrualId && onOpenAccrual ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => onOpenAccrual(createdAccrualId)}
              >
                {t("invoices.openAccrual")}
              </button>
            ) : null}
          </div>
        ) : null}
        {issueError ? <StatusMessage tone="error">{issueError}</StatusMessage> : null}
        {issueSuccess ? <StatusMessage tone="success">{issueSuccess}</StatusMessage> : null}

        {workspace && headerEditTarget && headerEditBaseline ? (
          <DraftInvoiceHeaderEditor
            key={headerEditTarget.id}
            documentNumberLabel={headerEditTarget.documentNumber}
            initialValues={headerEditBaseline}
            busy={headerEditBusy}
            formError={headerEditError}
            onSave={(values) => void handleSaveHeaderEdit(values)}
            onCancel={cancelHeaderEdit}
          />
        ) : null}

        {workspace && createAccrualTarget && createAccrualBaseline ? (
          <CreateAccrualFromInvoiceEditor
            key={`create-accrual-${createAccrualTarget.id}`}
            documentNumberLabel={createAccrualTarget.documentNumber}
            initialValues={createAccrualBaseline}
            busy={createAccrualBusy}
            formError={createAccrualError}
            onSave={(values) => void handleSaveCreateAccrual(values)}
            onCancel={cancelCreateAccrual}
          />
        ) : null}

        {workspace && lineAddTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleSaveLineAdd(event)}
          >
            <p className="meta">
              {t("invoices.lineAdd.intro")} <span className="mono">{lineAddTarget.documentNumber}</span>
            </p>
            <label>
              {t("invoices.field.quantity")}
              <input
                value={lineAddQuantity}
                onChange={(event) => setLineAddQuantity(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineAddBusy}
              />
            </label>
            <label>
              {t("invoices.field.price")}
              <input
                value={lineAddUnitPrice}
                onChange={(event) => setLineAddUnitPrice(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineAddBusy}
              />
            </label>
            <label>
              {t("invoices.field.lineDescription")}
              <input
                value={lineAddDescription}
                onChange={(event) => setLineAddDescription(event.target.value)}
                placeholder={t("invoices.lineDescriptionPlaceholder")}
                disabled={lineAddBusy}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={lineAddBusy || loading}>
                {lineAddBusy ? t("saving", { ns: "common" }) : t("invoices.addLine")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={lineAddBusy}
                onClick={cancelLineAdd}
              >
                {t("promise.cancelAction")}
              </button>
            </div>
          </form>
        ) : null}

        {workspace && lineUpdateTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleSaveLineUpdate(event)}
          >
            <p className="meta">
              {t("invoices.lineUpdate.intro", {
                line: draftInvoiceLineConfirmationLabel(lineUpdateTarget.line)
              })}{" "}
              <span className="mono">{lineUpdateTarget.invoice.documentNumber}</span>
            </p>
            <label>
              {t("invoices.field.quantity")}
              <input
                value={lineUpdateQuantity}
                onChange={(event) => setLineUpdateQuantity(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineUpdateBusy}
              />
            </label>
            <label>
              {t("invoices.field.price")}
              <input
                value={lineUpdateUnitPrice}
                onChange={(event) => setLineUpdateUnitPrice(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineUpdateBusy}
              />
            </label>
            <label>
              {t("invoices.field.lineDescription")}
              <input
                value={lineUpdateDescription}
                onChange={(event) => setLineUpdateDescription(event.target.value)}
                placeholder={t("invoices.lineDescriptionPlaceholder")}
                disabled={lineUpdateBusy}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={lineUpdateBusy || loading}>
                {lineUpdateBusy ? t("saving", { ns: "common" }) : t("invoices.lineUpdate.submit")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={lineUpdateBusy}
                onClick={cancelLineUpdate}
              >
                {t("promise.cancelAction")}
              </button>
            </div>
          </form>
        ) : null}

        {workspace && lineRemoveTarget ? (
          <div className="create-form issue-prepare-form" role="group" aria-label={t("invoices.lineRemove.aria")}>
            <p className="meta">
              {t("invoices.lineRemove.prompt", {
                line: draftInvoiceLineConfirmationLabel(lineRemoveTarget.line)
              })}{" "}
              <span className="mono">{lineRemoveTarget.invoice.documentNumber}</span>?
            </p>
            <div className="filter-actions">
              <button
                type="button"
                disabled={lineRemoveBusy || loading}
                onClick={() => void handleConfirmLineRemove()}
              >
                {lineRemoveBusy ? t("invoices.removing") : t("invoices.lineRemove.confirm")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={lineRemoveBusy}
                onClick={cancelLineRemove}
              >
                {t("promise.cancelAction")}
              </button>
            </div>
          </div>
        ) : null}

        {workspace && dueDateEditTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleSaveDueDate(event)}
          >
            <p className="meta">
              {t("invoices.dueDateEdit.intro")}{" "}
              <span className="mono">{dueDateEditTarget.documentNumber}</span>
            </p>
            <label>
              {t("invoices.field.dueDate")}
              <input
                type="date"
                value={dueDateEditValue}
                onChange={(event) => setDueDateEditValue(event.target.value)}
                required
                disabled={dueDateEditBusy}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={dueDateEditBusy || loading}>
                {dueDateEditBusy ? t("saving", { ns: "common" }) : t("save", { ns: "common" })}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={dueDateEditBusy}
                onClick={cancelDueDateEdit}
              >
                {t("promise.cancelAction")}
              </button>
            </div>
          </form>
        ) : null}

        {workspace && issueTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handlePrepareAndIssue(event)}
          >
            <p className="meta">
              {t("invoices.issuePrepare.intro")} <span className="mono">{issueTarget.documentNumber}</span>
            </p>
            {getInvoiceIssueReadiness(issueTarget).needsDueDate ? (
              <label>
                {t("invoices.field.dueDate")}
                <input
                  type="date"
                  value={issueDueDate}
                  onChange={(event) => setIssueDueDate(event.target.value)}
                  required
                />
              </label>
            ) : null}
            {getInvoiceIssueReadiness(issueTarget).needsLine ? (
              <>
                <label>
                  {t("invoices.field.quantity")}
                  <input
                    value={issueQuantity}
                    onChange={(event) => setIssueQuantity(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label>
                  {t("invoices.field.price")}
                  <input
                    value={issueUnitPrice}
                    onChange={(event) => setIssueUnitPrice(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label>
                  {t("invoices.field.lineDescription")}
                  <input
                    value={issueLineDescription}
                    onChange={(event) => setIssueLineDescription(event.target.value)}
                    placeholder={t("invoices.lineDescriptionPlaceholder")}
                  />
                </label>
              </>
            ) : null}
            <div className="filter-actions">
              <button type="submit" disabled={issueBusy}>
                {t("invoices.issuePrepare.submit")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={issueBusy}
                onClick={cancelIssuePrepare}
              >
                {t("promise.cancelAction")}
              </button>
            </div>
          </form>
        ) : null}

        {workspace && detailTargetId ? (
          <InvoiceDetailPanel
            invoice={detailInvoice}
            loading={detailLoading}
            error={detailError}
            errorRetryable={detailErrorRetryable}
            closeDisabled={detailLoading || isDetailRelatedPending()}
            headerEditBusy={
              headerEditBusy &&
              (savingHeaderInvoiceId === detailTargetId ||
                headerEditTarget?.id === detailTargetId)
            }
            headerEditOpen={Boolean(
              headerEditTarget && headerEditTarget.id === detailTargetId
            )}
            lineAddBusy={
              lineAddBusy &&
              (savingLineInvoiceId === detailTargetId ||
                lineAddTarget?.id === detailTargetId)
            }
            lineAddOpen={Boolean(lineAddTarget && lineAddTarget.id === detailTargetId)}
            lineUpdateBusy={
              lineUpdateBusy &&
              (savingLineUpdateInvoiceId === detailTargetId ||
                lineUpdateTarget?.invoice.id === detailTargetId)
            }
            lineUpdateOpen={Boolean(
              lineUpdateTarget && lineUpdateTarget.invoice.id === detailTargetId
            )}
            lineRemoveBusy={
              lineRemoveBusy &&
              (savingLineRemoveInvoiceId === detailTargetId ||
                lineRemoveTarget?.invoice.id === detailTargetId)
            }
            lineRemoveOpen={Boolean(
              lineRemoveTarget && lineRemoveTarget.invoice.id === detailTargetId
            )}
            dueDateEditBusy={
              dueDateEditBusy &&
              (savingDueDateInvoiceId === detailTargetId ||
                dueDateEditTarget?.id === detailTargetId)
            }
            dueDateEditOpen={Boolean(
              dueDateEditTarget && dueDateEditTarget.id === detailTargetId
            )}
            issueBusy={
              issueBusy &&
              (issuingInvoiceId === detailTargetId || issueTarget?.id === detailTargetId)
            }
            issueOpen={Boolean(issueTarget && issueTarget.id === detailTargetId)}
            createAccrualBusy={
              createAccrualBusy &&
              (savingCreateAccrualInvoiceId === detailTargetId ||
                createAccrualTarget?.id === detailTargetId)
            }
            createAccrualOpen={Boolean(
              createAccrualTarget && createAccrualTarget.id === detailTargetId
            )}
            relatedAccruals={relatedAccruals}
            relatedAccrualsLoading={relatedAccrualsLoading}
            relatedAccrualsError={relatedAccrualsError}
            onClose={closeDetailPanel}
            onRetry={retryInvoiceDetail}
            onRetryRelatedAccruals={() => {
              if (workspace && detailTargetId) {
                void loadRelatedAccruals(workspace.id, detailTargetId);
              }
            }}
            onEditHeader={(invoice) => beginHeaderEdit(invoice, { preserveDetail: true })}
            onAddLine={(invoice) => beginLineAdd(invoice, { preserveDetail: true })}
            onUpdateLine={(invoice, lineId) =>
              beginLineUpdate(invoice, lineId, { preserveDetail: true })
            }
            onRemoveLine={(invoice, lineId) =>
              beginLineRemove(invoice, lineId, { preserveDetail: true })
            }
            onEditDueDate={(invoice) =>
              beginDueDateEdit(invoice, { preserveDetail: true })
            }
            onIssue={(invoice) => beginIssue(invoice, { preserveDetail: true })}
            onCreateAccrual={(invoice) =>
              beginCreateAccrual(invoice, { preserveDetail: true })
            }
            onOpenAccrual={onOpenAccrual}
            collectionsContext={
              overdueQueueActive && detailInvoice
                ? {
                    daysOverdue: overdueDaysForInvoice(detailInvoice),
                    bucketLabel: (() => {
                      const bucket = agingBucketForInvoice(detailInvoice);
                      return bucket ? agingBucketLabel(bucket) : "—";
                    })(),
                    bucketId: agingBucketForInvoice(detailInvoice),
                    amountDisplay: formatMoney(
                      detailInvoice.totalAmount,
                      detailInvoice.currency
                    ),
                    counterpartyReference: detailInvoice.counterpartyReference,
                    status: detailInvoice.status,
                    dueDateDisplay: formatDate(detailInvoice.dueDateUtc),
                    positionLabel: collectionsPosition?.label ?? null,
                    canGoNext: Boolean(collectionsPosition?.nextId),
                    isLast: Boolean(collectionsPosition?.isLast),
                    onNext: openNextCollectionsInvoice
                  }
                : null
            }
            promiseContext={
              overdueQueueActive && detailTargetId
                ? {
                    record: detailPromiseRecord,
                    formOpen: promiseFormOpen,
                    promiseDate: promiseDateInput,
                    note: promiseNoteInput,
                    error: promiseFormError,
                    success: promiseFormSuccess,
                    busy: promiseBusy,
                    resolutionOpen,
                    resolutionKind,
                    resolutionPaymentDate,
                    resolutionPaidAmount,
                    resolutionRemainingAmount,
                    resolutionPromiseDate,
                    resolutionReason,
                    resolutionNote,
                    contactOpen,
                    contactChannel,
                    contactResult,
                    contactNote,
                    contactFollowUpAt,
                    disputeOpen,
                    disputeEditMode,
                    disputeCloseMode,
                    disputeReason,
                    disputeDescription,
                    disputeParty,
                    disputeReviewAt,
                    disputeCloseComment,
                    escalationOpen,
                    escalationEditMode,
                    escalationCompleteMode,
                    escalationReason,
                    escalationPriority,
                    escalationTeam,
                    escalationRequestedAction,
                    escalationDueDate,
                    escalationNote,
                    escalationCompleteComment,
                    notesOpen,
                    notesEditId,
                    noteBody,
                    noteAuthor,
                    noteCategory,
                    notePinned,
                    remindersOpen,
                    remindersEditId,
                    reminderTitle,
                    reminderNote,
                    reminderKind,
                    reminderDueDate,
                    attachmentsOpen,
                    attachmentsEditId,
                    attachmentFileName,
                    attachmentContentType,
                    attachmentSizeBytes,
                    attachmentCategory,
                    attachmentDescription,
                    attachmentUploadedBy,
                    attachmentHasNewFile: Boolean(attachmentContentDataUrl.trim()),
                    onOpenForm: () => openPromiseForm(detailPromiseRecord),
                    onCloseForm: closePromiseForm,
                    onPromiseDateChange: setPromiseDateInput,
                    onNoteChange: setPromiseNoteInput,
                    onSave: () => handleSavePromise(detailTargetId),
                    onMarkFollowUpRequired: () =>
                      handlePromiseStatus(detailTargetId, "follow_up_required"),
                    onMarkContacted: () =>
                      handlePromiseStatus(detailTargetId, "contacted"),
                    onComplete: () => handlePromiseStatus(detailTargetId, "completed"),
                    onReopen: () => handlePromiseStatus(detailTargetId, "awaiting"),
                    onOpenResolution: openResolutionForm,
                    onCloseResolution: closeResolutionForm,
                    onResolutionKindChange: setResolutionKind,
                    onResolutionPaymentDateChange: setResolutionPaymentDate,
                    onResolutionPaidAmountChange: setResolutionPaidAmount,
                    onResolutionRemainingAmountChange: setResolutionRemainingAmount,
                    onResolutionPromiseDateChange: setResolutionPromiseDate,
                    onResolutionReasonChange: setResolutionReason,
                    onResolutionNoteChange: setResolutionNote,
                    onSaveResolution: () => handleSaveResolution(detailTargetId),
                    onOpenContact: () => openContactForm(detailPromiseRecord),
                    onCloseContact: closeContactForm,
                    onContactChannelChange: setContactChannel,
                    onContactResultChange: setContactResult,
                    onContactNoteChange: setContactNote,
                    onContactFollowUpAtChange: setContactFollowUpAt,
                    onSaveContact: () => handleSaveContact(detailTargetId),
                    onClearFollowUp: () => handleClearFollowUp(detailTargetId),
                    onOpenRaiseDispute: openRaiseDisputeForm,
                    onOpenEditDispute: () => openEditDisputeForm(detailPromiseRecord),
                    onOpenResolveDispute: openResolveDisputeForm,
                    onOpenRejectDispute: openRejectDisputeForm,
                    onCloseDisputeForm: closeDisputeForm,
                    onDisputeReasonChange: setDisputeReason,
                    onDisputeDescriptionChange: setDisputeDescription,
                    onDisputePartyChange: setDisputeParty,
                    onDisputeReviewAtChange: setDisputeReviewAt,
                    onDisputeCloseCommentChange: setDisputeCloseComment,
                    onSaveDispute: () => handleSaveDispute(detailTargetId),
                    onConfirmCloseDispute: () => handleConfirmCloseDispute(detailTargetId),
                    onOpenEscalateCase: openEscalateCaseForm,
                    onOpenEditEscalation: () => openEditEscalationForm(detailPromiseRecord),
                    onOpenCompleteEscalation: openCompleteEscalationForm,
                    onCloseEscalationForm: closeEscalationForm,
                    onEscalationReasonChange: setEscalationReason,
                    onEscalationPriorityChange: setEscalationPriority,
                    onEscalationTeamChange: setEscalationTeam,
                    onEscalationRequestedActionChange: setEscalationRequestedAction,
                    onEscalationDueDateChange: setEscalationDueDate,
                    onEscalationNoteChange: setEscalationNote,
                    onEscalationCompleteCommentChange: setEscalationCompleteComment,
                    onSaveEscalation: () => handleSaveEscalation(detailTargetId),
                    onConfirmCompleteEscalation: () =>
                      handleConfirmCompleteEscalation(detailTargetId),
                    onOpenAddNote: openAddNoteForm,
                    onOpenEditNote: openEditNoteForm,
                    onCloseNotesForm: closeNotesForm,
                    onNoteBodyChange: setNoteBody,
                    onNoteAuthorChange: setNoteAuthor,
                    onNoteCategoryChange: setNoteCategory,
                    onNotePinnedChange: setNotePinned,
                    onSaveNote: () => handleSaveNote(detailTargetId),
                    onArchiveNote: (noteId) => handleArchiveNote(detailTargetId, noteId),
                    onOpenAddReminder: openAddReminderForm,
                    onOpenEditReminder: openEditReminderForm,
                    onCloseRemindersForm: closeRemindersForm,
                    onReminderTitleChange: setReminderTitle,
                    onReminderNoteChange: setReminderNote,
                    onReminderKindChange: setReminderKind,
                    onReminderDueDateChange: setReminderDueDate,
                    onSaveReminder: () => handleSaveReminder(detailTargetId),
                    onCompleteReminder: (reminderId) =>
                      handleCompleteReminder(detailTargetId, reminderId),
                    onCancelReminder: (reminderId) =>
                      handleCancelReminder(detailTargetId, reminderId),
                    onOpenAddAttachment: openAddAttachmentForm,
                    onOpenEditAttachment: openEditAttachmentForm,
                    onCloseAttachmentsForm: closeAttachmentsForm,
                    onAttachmentFileSelected: handleAttachmentFileSelected,
                    onAttachmentCategoryChange: setAttachmentCategory,
                    onAttachmentDescriptionChange: setAttachmentDescription,
                    onAttachmentUploadedByChange: setAttachmentUploadedBy,
                    onSaveAttachment: () => handleSaveAttachment(detailTargetId),
                    onArchiveAttachment: (attachmentId) =>
                      handleArchiveAttachment(detailTargetId, attachmentId),
                    paymentPlanOpen,
                    paymentPlanEditMode,
                    paymentPlanCancelMode,
                    paymentPlanRecordMode,
                    paymentPlanAmount,
                    paymentPlanInstallments,
                    paymentPlanReplacePromise,
                    paymentPlanCancelReason,
                    paymentPlanRecordInstallmentId,
                    paymentPlanRecordAmount,
                    paymentPlanRecordNote,
                    onOpenCreatePaymentPlan: openCreatePaymentPlanForm,
                    onOpenEditPaymentPlan: () =>
                      openEditPaymentPlanForm(detailPromiseRecord),
                    onOpenCancelPaymentPlan: openCancelPaymentPlanForm,
                    onOpenRecordInstallmentPayment: openRecordInstallmentPaymentForm,
                    onClosePaymentPlanForm: closePaymentPlanForm,
                    onPaymentPlanAmountChange: setPaymentPlanAmount,
                    onPaymentPlanReplacePromiseChange: setPaymentPlanReplacePromise,
                    onPaymentPlanCancelReasonChange: setPaymentPlanCancelReason,
                    onPaymentPlanRecordAmountChange: setPaymentPlanRecordAmount,
                    onPaymentPlanRecordNoteChange: setPaymentPlanRecordNote,
                    onAddPaymentPlanInstallment: () =>
                      setPaymentPlanInstallments((rows) => [
                        ...rows,
                        emptyInstallmentDraft()
                      ]),
                    onRemovePaymentPlanInstallment: (index) =>
                      setPaymentPlanInstallments((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index)
                      ),
                    onPaymentPlanInstallmentDueDateChange: (index, value) =>
                      setPaymentPlanInstallments((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, dueDate: value } : row
                        )
                      ),
                    onPaymentPlanInstallmentAmountChange: (index, value) =>
                      setPaymentPlanInstallments((rows) =>
                        rows.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, expectedAmount: value } : row
                        )
                      ),
                    onSavePaymentPlan: () => handleSavePaymentPlan(detailTargetId),
                    onConfirmCancelPaymentPlan: () =>
                      handleConfirmCancelPaymentPlan(detailTargetId),
                    onConfirmRecordInstallmentPayment: () =>
                      handleConfirmRecordInstallmentPayment(detailTargetId)
                  }
                : null
            }
            historyContext={
              overdueQueueActive && detailTargetId
                ? {
                    open: caseHistoryOpen,
                    view: caseHistoryView,
                    typeFilter: caseHistoryType,
                    searchDraft: caseHistorySearchDraft,
                    onOpen: () => openCaseHistory(detailTargetId),
                    onClose: closeCaseHistory,
                    onTypeChange: applyCaseHistoryType,
                    onSearchDraftChange: setCaseHistorySearchDraft,
                    onSearchSubmit: applyCaseHistorySearch,
                    onToggleExpanded: () =>
                      applyCaseHistoryExpanded(!caseHistoryExpanded)
                  }
                : null
            }
          />
        ) : null}

        {workspace ? (
          <ListLoadState
            loading={loading}
            loadingMessage={t("invoices.listLoading")}
            error={error}
            onRetry={() => void loadPage(workspace.id, page, appliedFilters, invoiceQueue)}
            retryDisabled={loading}
            empty={listEmpty}
            emptyMessage={
              workbenchPanelActive
                ? workbenchSection || promiseSearch || workbenchHideCompleted
                  ? t("workbench.emptyFiltered")
                  : t("workbench.empty")
                : followUpsPanelActive
                  ? promiseGroup || promiseSearch
                    ? t("promise.emptyFiltered")
                    : t("promise.empty")
                  : overdueQueueActive
                    ? agingBucket
                      ? t(
                        queueHideSettled
                          ? "collections.queueEmptyBucketOpen"
                          : "collections.queueEmptyBucketAll",
                        { bucket: agingBucketLabel(agingBucket) }
                      )
                      : queueHideSettled &&
                          collectionsSummary &&
                          collectionsSummary.settledCount > 0
                        ? t("collections.queueEmptySettledHidden", {
                          count: collectionsSummary.settledCount
                        })
                        : t("collections.queueEmpty")
                    : filtersActive
                      ? t("invoices.listEmptyFiltered")
                      : t("invoices.listEmpty")
            }
          />
        ) : null}

        {workbenchPanelActive && workbenchFilteredCases.length > 0 ? (
          <>
            <p className="meta">
              {t("workbench.summary", { count: workbenchFilteredCases.length })}
              {workbenchSection
                ? t("workbench.summarySection", {
                    section: t(workbenchSectionKey(workbenchSection))
                  })
                : ""}
              {promiseSearch
                ? t("workbench.summarySearch", { search: promiseSearch })
                : ""}
              {workbenchHideCompleted ? t("workbench.summaryCompletedHidden") : ""}
              {workbenchSelectedIds.length > 0
                ? t("workbench.summarySelected", { count: workbenchSelectedIds.length })
                : ""}
            </p>
            {workbenchSections.map((section) => (
              <div key={section.id} className="promise-group-section workbench-section">
                <h4 className="promise-group-title">
                  {t(workbenchSectionKey(section.id))}
                  <span className="meta">
                    {t("workbench.sectionMeta", {
                      count: section.count,
                      totals: formatTotals(section.totalsByCurrency)
                    })}
                  </span>
                </h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={
                              section.cases.length > 0 &&
                              section.cases.every((item) =>
                                workbenchSelectedIds.includes(item.invoiceId)
                              )
                            }
                            onChange={() => {
                              const ids = section.cases.map((item) => item.invoiceId);
                              const allOn = ids.every((id) =>
                                workbenchSelectedIds.includes(id)
                              );
                              setWorkbenchSelectedIds((current) =>
                                allOn
                                  ? current.filter((id) => !ids.includes(id))
                                  : [...new Set([...current, ...ids])]
                              );
                            }}
                            aria-label={t("workbench.selectSectionAria", {
                              section: t(workbenchSectionKey(section.id))
                            })}
                          />
                        </th>
                        <th>{t("workbench.col.invoiceNumber")}</th>
                        <th>{t("workbench.col.customer")}</th>
                        <th>{t("workbench.col.amount")}</th>
                        <th>{t("workbench.col.nextActionDate")}</th>
                        <th>{t("workbench.col.nextBestAction")}</th>
                        <th>{t("workbench.col.status")}</th>
                        <th>{t("workbench.col.action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.cases.map((item) => {
                        const selected =
                          item.invoiceId === detailTargetId ||
                          item.invoiceId === highlightedId;
                        const checked = workbenchSelectedIds.includes(item.invoiceId);
                        return (
                          <tr
                            key={item.invoiceId}
                            data-row-id={item.invoiceId}
                            className={
                              selected
                                ? `row-attention row-attention--promise-${item.group} row-highlight row-selected`
                                : `row-attention row-attention--promise-${item.group}`
                            }
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleWorkbenchSelection(item.invoiceId)}
                                aria-label={t("workbench.selectRowAria", {
                                  document: item.documentNumber
                                })}
                              />
                            </td>
                            <td className="cell-wrap">{item.documentNumber}</td>
                            <td className="cell-wrap">{item.counterpartyReference}</td>
                            <td>{formatMoney(item.overdueAmount, item.currency)}</td>
                            <td>
                              {item.nextActionDate}
                              {item.nextFollowUpAt ? (
                                <span className="meta">{t("workbench.tag.followUp")}</span>
                              ) : null}
                              {item.disputeReviewAt ? (
                                <span className="meta">{t("workbench.tag.disputeReview")}</span>
                              ) : null}
                              {item.escalationDueAt ? (
                                <span className="meta">
                                  {" "}{t("workbench.tag.escalation")}
                                  {item.escalationOverdue ? t("workbench.tag.overdueWord") : ""}
                                </span>
                              ) : null}
                              {item.paymentPlanNextDueAt ? (
                                <span className="meta">
                                  {" "}{t("workbench.tag.plan")}
                                  {item.paymentPlanOverdue ? t("workbench.tag.overdueWord") : ""}
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <span className="aging-badge aging-badge--promise aging-badge--nba">
                                {item.nextBestActionLabel}
                              </span>
                              {item.nextActionLabel ? (
                                <p className="meta cell-wrap">{item.nextActionLabel}</p>
                              ) : null}
                              {item.dispute && item.group === "disputed" ? (
                                <p className="meta cell-wrap">
                                  {disputeReasonLabel(item.dispute.reason)}
                                  {" · "}
                                  {disputePartyLabel(item.dispute.responsibleParty)}
                                </p>
                              ) : null}
                              {item.escalation && item.group === "escalated" ? (
                                <p className="meta cell-wrap">
                                  {escalationPriorityLabel(item.escalation.priority)}
                                  {" · "}
                                  {escalationReasonLabel(item.escalation.reason)}
                                  {" · "}
                                  {escalationTeamLabel(item.escalation.responsibleTeam)}
                                  {item.escalationOverdue ? t("workbench.tag.overdueDot") : ""}
                                  <br />
                                  {item.escalation.requestedAction.length > 60
                                    ? `${item.escalation.requestedAction.slice(0, 57)}…`
                                    : item.escalation.requestedAction}
                                </p>
                              ) : null}
                              {item.paymentPlan && item.group === "payment_plans" ? (
                                <p className="meta cell-wrap">
                                  {formatMoney(
                                    item.paymentPlanPaidTotal ?? 0,
                                    item.currency
                                  )}
                                  {" / "}
                                  {formatMoney(
                                    item.paymentPlanAmount ?? item.paymentPlan.planAmount,
                                    item.currency
                                  )}
                                  {item.paymentPlanProgress != null
                                    ? ` · ${Math.round(item.paymentPlanProgress * 100)}%`
                                    : ""}
                                  {item.paymentPlanNextDueAt
                                    ? t("workbench.tag.nextDue", { date: item.paymentPlanNextDueAt })
                                    : ""}
                                  {item.paymentPlanOverdue ? t("workbench.tag.overdueDot") : ""}
                                </p>
                              ) : null}
                            </td>
                            <td>
                              <span
                                className={`aging-badge aging-badge--promise aging-badge--promise-${item.status}`}
                              >
                                {item.statusLabel}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => {
                                    const invoice = invoices.find(
                                      (row) => row.id === item.invoiceId
                                    );
                                    if (invoice) {
                                      beginViewInvoiceDetails(invoice);
                                    } else {
                                      onSelectedInvoiceIdChange?.(item.invoiceId);
                                    }
                                  }}
                                >
                                  {t("invoices.openAction")}
                                </button>
                                <button
                                  type="button"
                                  className="button-secondary"
                                  onClick={() => openCaseHistory(item.invoiceId)}
                                >
                                  {t("workbench.historyAction")}
                                </button>
                                {item.status !== "completed" ? (
                                  <>
                                    <button
                                      type="button"
                                      className="button-secondary"
                                      onClick={() => {
                                        updatePromiseStatus(item.invoiceId, "contacted");
                                        bumpPromiseRevision();
                                      }}
                                    >
                                      {t("workbench.rowContacted")}
                                    </button>
                                    <button
                                      type="button"
                                      className="button-secondary"
                                      onClick={() => {
                                        updatePromiseStatus(
                                          item.invoiceId,
                                          "follow_up_required"
                                        );
                                        bumpPromiseRevision();
                                      }}
                                    >
                                      {t("workbench.rowFollowUp")}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {workbenchFilteredCases.length > 0 ? (
              <p className="meta">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={toggleWorkbenchSelectAllVisible}
                >
                  {workbenchFilteredCases.every((item) =>
                    workbenchSelectedIds.includes(item.invoiceId)
                  )
                    ? t("workbench.clearSelection")
                    : t("workbench.selectAllVisible")}
                </button>
              </p>
            ) : null}
          </>
        ) : null}

        {followUpsPanelActive && promiseGroups && promiseFollowUpItems.length > 0 ? (
          <>
            <p className="meta">
              {t("promise.summary", { count: promiseFollowUpItems.length })}
              {promiseGroup
                ? t("promise.summaryGroup", {
                    group: t(promiseGroupKey(promiseGroup))
                  })
                : ""}
              {promiseSearch
                ? t("promise.summarySearch", { search: promiseSearch })
                : ""}
            </p>
            {(
              [
                "due_today",
                "upcoming",
                "broken",
                "follow_up_required",
                "disputed",
                "escalated",
                "completed"
              ] as const
            )
              .filter((groupId) => !promiseGroup || promiseGroup === groupId)
              .map((groupId) => {
                const rows = promiseGroups[groupId];
                if (rows.length === 0) {
                  return null;
                }
                return (
                  <div key={groupId} className="promise-group-section">
                    <h4 className="promise-group-title">
                      {t(promiseGroupKey(groupId))}
                    </h4>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("promise.col.invoiceNumber")}</th>
                            <th>{t("promise.col.customer")}</th>
                            <th>{t("promise.col.overdueAmount")}</th>
                            <th>{t("promise.col.originalDueDate")}</th>
                            <th>{t("promise.col.promiseDate")}</th>
                            <th>{t("promise.col.daysToPromise")}</th>
                            <th>{t("promise.col.followUpStatus")}</th>
                            <th>{t("promise.col.resolution")}</th>
                            <th>{t("promise.col.note")}</th>
                            <th>{t("invoices.col.action")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((item: PromiseFollowUpItem) => {
                            const selected =
                              item.invoiceId === detailTargetId ||
                              item.invoiceId === highlightedId;
                            return (
                              <tr
                                key={item.invoiceId}
                                data-row-id={item.invoiceId}
                                className={
                                  selected
                                    ? `row-attention row-attention--promise-${item.group} row-highlight row-selected`
                                    : `row-attention row-attention--promise-${item.group}`
                                }
                              >
                                <td className="cell-wrap">{item.documentNumber}</td>
                                <td className="cell-wrap">{item.counterpartyReference}</td>
                                <td>{formatMoney(item.overdueAmount, item.currency)}</td>
                                <td>
                                  {item.originalDueDate
                                    ? formatDate(`${item.originalDueDate}T00:00:00.000Z`)
                                    : "—"}
                                </td>
                                <td>{item.promiseDate}</td>
                                <td>
                                  <span
                                    className={`aging-badge aging-badge--promise aging-badge--promise-group-${item.group}`}
                                  >
                                    {item.daysRelativeLabel}
                                  </span>
                                </td>
                                <td>
                                  <span
                                    className={`aging-badge aging-badge--promise aging-badge--promise-${item.status}`}
                                  >
                                    {item.statusLabel}
                                  </span>
                                </td>
                                <td>
                                  {item.resolutionLabel ? (
                                    <span
                                      className={`aging-badge aging-badge--promise aging-badge--resolution-${item.resolution?.kind ?? "none"}`}
                                    >
                                      {item.resolutionLabel}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="cell-wrap">{item.note || "—"}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={() => {
                                      const invoice = invoices.find(
                                        (row) => row.id === item.invoiceId
                                      );
                                      if (invoice) {
                                        beginViewInvoiceDetails(invoice);
                                      } else {
                                        onSelectedInvoiceIdChange?.(item.invoiceId);
                                      }
                                    }}
                                  >
                                    {t("invoices.openAction")}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </>
        ) : null}

        {!promisePanelActive && displayInvoices.length > 0 ? (
          <>
            <p className="meta">
              {overdueQueueActive
                ? `${t("collections.tableMeta", { shown: displayInvoices.length })}${
                    queueHideSettled && collectionsSummary
                      ? t("collections.tableMetaSettled", {
                          count: collectionsSummary.settledCount
                        })
                      : ""
                  }${t("collections.tableMetaTotal", { total: totalCount })}`
                : t("invoices.pageMeta", {
                  page,
                  shown: displayInvoices.length,
                  total: totalCount
                })}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {overdueQueueActive ? (
                      <>
                        <th>{t("collections.col.invoiceNumber")}</th>
                        <th>{t("collections.col.customer")}</th>
                        <th>{t("collections.col.amount")}</th>
                        <th>{t("collections.col.currency")}</th>
                        <th>{t("collections.col.dueDate")}</th>
                        <th>{t("collections.col.daysOverdue")}</th>
                        <th>{t("collections.col.status")}</th>
                        <th>{t("collections.col.settlement")}</th>
                        <th>{t("invoices.col.action")}</th>
                      </>
                    ) : (
                      <>
                        <th>{t("invoices.col.number")}</th>
                        <th>{t("invoices.col.counterparty")}</th>
                        <th>{t("invoices.col.amount")}</th>
                        <th>{t("invoices.col.currency")}</th>
                        <th>{t("invoices.col.issued")}</th>
                        <th>{t("invoices.col.dueDate")}</th>
                        <th>{t("invoices.col.status")}</th>
                        <th>{t("invoices.col.agingStatus")}</th>
                        <th>{t("invoices.col.daysBucket")}</th>
                        <th>{t("invoices.col.action")}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayInvoices.map((invoice) => {
                    const aging = classifyDueDateAging(invoice.dueDateUtc);
                    const bucket = agingBucketForInvoice(invoice);
                    const daysOverdue = overdueDaysForInvoice(invoice);
                    const selected =
                      invoice.id === detailTargetId || invoice.id === highlightedId;
                    const settlement = overdueQueueActive
                      ? resolveCollectionQueueSettlement(
                          invoice,
                          promiseRecordsById.get(invoice.id)
                        )
                      : null;
                    const displayAmount =
                      overdueQueueActive && settlement && settlement.state === "open"
                        ? settlement.openAmount
                        : invoice.totalAmount;
                    const attentionClass = overdueQueueActive
                      ? settlement?.state === "settled"
                        ? "row-attention row-attention--settled"
                        : aging.kind === "overdue"
                          ? "row-attention row-attention--overdue"
                          : aging.kind === "due_today"
                            ? "row-attention row-attention--due-today"
                            : ""
                      : "";
                    const rowClass = [attentionClass, selected ? "row-highlight row-selected" : ""]
                      .filter(Boolean)
                      .join(" ");
                    return (
                    <tr
                      key={invoice.id}
                      data-row-id={invoice.id}
                      className={rowClass || undefined}
                    >
                      {overdueQueueActive ? (
                        <>
                          <td className="cell-wrap">{invoice.documentNumber}</td>
                          <td className="cell-wrap">{invoice.counterpartyReference}</td>
                          <td>{formatMoney(displayAmount, invoice.currency)}</td>
                          <td>{invoice.currency}</td>
                          <td>{formatDate(invoice.dueDateUtc)}</td>
                          <td>
                            {daysOverdue != null ? (
                              <span className="aging-badge aging-badge--overdue">
                                {t("collections.daysShort", { count: daysOverdue })}
                              </span>
                            ) : aging.kind === "due_today" ? (
                              <span className="aging-badge aging-badge--due_today">
                                {t("collections.dueToday")}
                              </span>
                            ) : (
                              aging.dayOffsetLabel
                            )}
                          </td>
                          <td>
                            <span className={`aging-badge aging-badge--${aging.kind}`}>
                              {statusLabel(invoice.status)}
                              </span>
                          </td>
                          <td>
                            {settlement?.label ? (
                              <span
                                className={`aging-badge ${
                                  settlement.state === "settled"
                                    ? "aging-badge--settled"
                                    : settlement.isPartial
                                      ? "aging-badge--resolution-partially_paid"
                                      : "aging-badge--settlement-open"
                                }`}
                              >
                                {settlement.label}
                              </span>
                            ) : (
                              <span className="aging-badge aging-badge--settlement-open">
                                {t("collections.settlementOpen")}
                                </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="cell-wrap">{invoice.documentNumber}</td>
                          <td className="cell-wrap">{invoice.counterpartyReference}</td>
                          <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                          <td>{invoice.currency}</td>
                          <td>{formatDate(invoice.issuedAtUtc)}</td>
                          <td>{formatDate(invoice.dueDateUtc)}</td>
                          <td>{statusLabel(invoice.status)}</td>
                          <td>
                            <span className={`aging-badge aging-badge--${aging.kind}`}>
                              {aging.label}
                            </span>
                          </td>
                          <td>
                            {daysOverdue != null && bucket
                              ? t("invoices.daysBucket", { days: daysOverdue, bucket })
                              : aging.dayOffsetLabel}
                          </td>
                        </>
                      )}
                      <td>
                        <div className="filter-actions">
                          {canViewInvoiceDetails(invoice) ? (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={loading || detailLoading}
                              onClick={() => beginViewInvoiceDetails(invoice)}
                            >
                              {detailLoading && detailTargetId === invoice.id
                                ? t("loading", { ns: "common" })
                                : t("details", { ns: "common" })}
                            </button>
                          ) : null}
                          {canEditDraftInvoiceHeader(invoice) ? (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                headerEditBusy ||
                                createAccrualBusy ||
                                lineAddBusy ||
                                lineUpdateBusy ||
                                lineRemoveBusy ||
                                dueDateEditBusy ||
                                issueBusy ||
                                loading ||
                                headerEditTarget?.id === invoice.id
                              }
                              onClick={() => beginHeaderEdit(invoice)}
                            >
                              {headerEditBusy && savingHeaderInvoiceId === invoice.id
                                ? t("saving", { ns: "common" })
                                : t("invoices.editHeader")}
                            </button>
                          ) : null}
                          {canAddDraftInvoiceLine(invoice) ? (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                headerEditBusy ||
                                createAccrualBusy ||
                                lineAddBusy ||
                                lineUpdateBusy ||
                                lineRemoveBusy ||
                                dueDateEditBusy ||
                                issueBusy ||
                                loading ||
                                lineAddTarget?.id === invoice.id
                              }
                              onClick={() => beginLineAdd(invoice)}
                            >
                              {lineAddBusy && savingLineInvoiceId === invoice.id
                                ? t("saving", { ns: "common" })
                                : t("invoices.addLine")}
                            </button>
                          ) : null}
                          {canEditDraftInvoiceDueDate(invoice) ? (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                headerEditBusy ||
                                createAccrualBusy ||
                                dueDateEditBusy ||
                                lineAddBusy ||
                                lineUpdateBusy ||
                                lineRemoveBusy ||
                                issueBusy ||
                                loading ||
                                dueDateEditTarget?.id === invoice.id
                              }
                              onClick={() => beginDueDateEdit(invoice)}
                            >
                              {dueDateEditBusy && savingDueDateInvoiceId === invoice.id
                                ? t("saving", { ns: "common" })
                                : t("invoices.changeDueDateShort")}
                            </button>
                          ) : null}
                          {isDraftInvoice(invoice) ? (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                headerEditBusy ||
                                createAccrualBusy ||
                                issueBusy ||
                                dueDateEditBusy ||
                                lineAddBusy ||
                                lineUpdateBusy ||
                                lineRemoveBusy ||
                                loading ||
                                issueTarget?.id === invoice.id
                              }
                              onClick={() => beginIssue(invoice)}
                            >
                              {t("invoices.issue")}
                            </button>
                          ) : null}
                          {canCreateAccrualFromInvoice(invoice) ? (
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={
                                headerEditBusy ||
                                createAccrualBusy ||
                                issueBusy ||
                                dueDateEditBusy ||
                                lineAddBusy ||
                                lineUpdateBusy ||
                                lineRemoveBusy ||
                                loading ||
                                createAccrualTarget?.id === invoice.id
                              }
                              onClick={() => beginCreateAccrual(invoice)}
                            >
                              {createAccrualBusy &&
                              savingCreateAccrualInvoiceId === invoice.id
                                ? t("creating", { ns: "common" })
                                : t("invoices.createAccrual")}
                            </button>
                          ) : null}
                          {!canViewInvoiceDetails(invoice) &&
                          !isDraftInvoice(invoice) &&
                          !canCreateAccrualFromInvoice(invoice) ? (
                            <span className="meta">—</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
            <div className="pagination" role="navigation" aria-label={t("invoices.paginationAria")}>
              <button
                type="button"
                disabled={!canGoPrevious}
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  publishDiscovery(
                    nextPage,
                    appliedFilters,
                    invoiceQueue,
                    agingBucket,
                    collectionPanel,
                    promiseGroup,
                    promiseSearch,
                    workbenchSort,
                    workbenchHideCompleted,
                    workbenchSection
                  );
                }}
              >
                {t("back", { ns: "common" })}
              </button>
              <span className="meta">
                {page} / {pages}
              </span>
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => {
                  const nextPage = page + 1;
                  setPage(nextPage);
                  publishDiscovery(
                    nextPage,
                    appliedFilters,
                    invoiceQueue,
                    agingBucket,
                    collectionPanel,
                    promiseGroup,
                    promiseSearch,
                    workbenchSort,
                    workbenchHideCompleted,
                    workbenchSection
                  );
                }}
              >
                {t("next", { ns: "common" })}
              </button>
            </div>
          </>
        ) : null}
      </Panel>
    </>
  );
}
