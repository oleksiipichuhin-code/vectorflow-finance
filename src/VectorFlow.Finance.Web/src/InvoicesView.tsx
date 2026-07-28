import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  overdueIssuedInvoicesDiscovery
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
  overdueQueueDueToDateInput
} from "./invoiceDueDateAging";
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
import { formatDate, formatMoney } from "./format";

type InvoiceIdChangeOptions = {
  replace?: boolean;
};

type InvoicesViewProps = {
  workspace: FinanceWorkspace | null;
  initialPage?: number;
  initialFilters?: InvoiceListFilters;
  initialInvoiceQueue?: InvoiceQueueMode;
  selectedInvoiceId?: string | null;
  onDiscoveryChange?: (
    page: number,
    filters: InvoiceListFilters,
    invoiceQueue?: InvoiceQueueMode
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
  selectedInvoiceId = null,
  onDiscoveryChange,
  onSelectedInvoiceIdChange,
  onShowDraftInvoices,
  onShowIssuedInvoices,
  onShowOverdueIssuedInvoices,
  onOpenAccrual
}: InvoicesViewProps) {
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
      onDiscoveryChange?.(1, emptyFilters, "");
    }
  }, [workspace?.id, onDiscoveryChange, onSelectedInvoiceIdChange, selectedInvoiceId]);

  const loadPage = useCallback(
    async (
      workspaceId: string,
      nextPage: number,
      filters: InvoiceListFilters,
      queue: InvoiceQueueMode = ""
    ) => {
      const { query, validationError } = buildInvoiceListQuery(
        nextPage,
        INVOICE_PAGE_SIZE,
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
          loadError instanceof Error ? loadError.message : "Не вдалося завантажити рахунки."
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

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQueue: InvoiceQueueMode =
      invoiceQueue === "overdue" &&
      (draftFilters.status === "Issued" || draftFilters.status === "")
        ? "overdue"
        : "";
    const filtersForQuery =
      nextQueue === "overdue"
        ? { ...draftFilters, status: "Issued" as const }
        : { ...draftFilters };
    const { validationError } = buildInvoiceListQuery(
      1,
      INVOICE_PAGE_SIZE,
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
    onDiscoveryChange?.(1, { ...filtersForQuery }, nextQueue);
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
      setFilterValidationError(null);
      setPage(1);
      onDiscoveryChange?.(1, next, "");
      return;
    }

    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setInvoiceQueue("");
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, emptyFilters, "");
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
        `Чернетку рахунка «${created.documentNumber}» створено. Запис показано у списку нижче.`
      );
      onDiscoveryChange?.(1, emptyFilters, "");
      await loadPage(workspace.id, 1, emptyFilters, "");
    } catch (createErr) {
      setCreateError(
        createErr instanceof Error ? createErr.message : "Не вдалося створити рахунок."
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
          throw new Error("Вкажіть кількість і ціну рядка перед виставленням.");
        }

        await addInvoiceLine(workspace.id, invoice.id, {
          quantity,
          unitPrice,
          description: preparation?.description
        });
      }

      if (readiness.needsDueDate) {
        if (!preparation?.dueDateUtc) {
          throw new Error("Вкажіть дату оплати перед виставленням.");
        }

        await setInvoiceDueDate(workspace.id, invoice.id, preparation.dueDateUtc);
      }

      const issued = await issueInvoice(workspace.id, invoice.id);
      setIssueTarget(null);
      setHighlightedId(issued.id);
      setIssueSuccess(
        `Рахунок «${issued.documentNumber}» виставлено. Статус: ${issued.status}.`
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
          throw new Error("Кількість має бути додатним числом.");
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new Error("Ціна має бути невід’ємним числом.");
        }
        if (quantity * unitPrice <= 0) {
          throw new Error("Сума рядка має бути додатною.");
        }
      }
    } catch (validationErr) {
      setIssueError(
        validationErr instanceof Error
          ? validationErr.message
          : "Перевірте дані підготовки рахунка."
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
        `Дату оплати рахунка «${updated.documentNumber}» оновлено.`
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
        `Реквізити рахунка «${updated.documentNumber}» оновлено.`
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
        `Чернетку нарахування «${created.description}» створено з рахунком «${target.documentNumber}».`
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
      setLineAddSuccess(`Рядок додано до рахунка «${updated.documentNumber}».`);
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
      setLineUpdateSuccess(`Рядок оновлено в рахунку «${updated.documentNumber}».`);
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
      setLineRemoveSuccess(`Рядок видалено з рахунка «${updated.documentNumber}».`);
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
    ? overdueQueueDueToDateInput()
    : appliedFilters.dueToDate?.trim() || "";
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
    !appliedFilters.dueFromDate?.trim();

  function applyDraftInvoicesFilter() {
    if (onShowDraftInvoices) {
      onShowDraftInvoices();
      return;
    }

    const next = draftInvoicesDiscovery().invoiceFilters;
    setDraftFilters(next);
    setAppliedFilters(next);
    setInvoiceQueue("");
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, next, "");
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
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, next, "");
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
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, discovery.invoiceFilters, "overdue");
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Invoices</h1>
        <p className="lede">
          Рахунки обраного фінансового простору з реального Finance API: фільтри за номером,
          контрагентом, статусом, датами створення / виставлення / оплати; посторінковий перегляд.
        </p>
      </header>

      <Panel
        title="Рахунки"
        headingId="invoices-heading"
        actions={
          <button
            type="button"
            onClick={() => workspace && void loadPage(workspace.id, page, appliedFilters, invoiceQueue)}
            disabled={!workspace || loading}
          >
            Оновити
          </button>
        }
      >
        {!workspace ? (
          <StatusMessage>Спочатку завантажте Workspace.</StatusMessage>
        ) : (
          <>
            <p className="meta">
              Workspace: {workspace.name} · <span className="mono">{workspace.id}</span>
            </p>

            <div
              className="list-shortcuts"
              role="group"
              aria-label="Швидкі фільтри рахунків"
            >
              <p className="list-shortcuts-label">Швидкий фільтр</p>
              <div className="list-shortcuts-row">
                <button
                  type="button"
                  className={
                    draftFilterActive
                      ? "list-shortcut list-shortcut--active"
                      : "list-shortcut"
                  }
                  title="status=Draft · page 1 · інші фільтри скинуто"
                  aria-pressed={draftFilterActive}
                  disabled={loading}
                  onClick={applyDraftInvoicesFilter}
                >
                  Чернетки
                </button>
                <button
                  type="button"
                  className={
                    issuedFilterActive
                      ? "list-shortcut list-shortcut--active"
                      : "list-shortcut"
                  }
                  title="status=Issued · page 1 · інші фільтри скинуто · далі звузьте пошук"
                  aria-pressed={issuedFilterActive}
                  disabled={loading}
                  onClick={applyIssuedInvoicesFilter}
                >
                  Виставлені
                </button>
                <button
                  type="button"
                  className={
                    overdueFilterActive
                      ? "list-shortcut list-shortcut--attention list-shortcut--active"
                      : "list-shortcut list-shortcut--attention"
                  }
                  title="status=Issued · queue=overdue · строк раніше за сьогодні · не факт оплати"
                  aria-pressed={overdueFilterActive}
                  disabled={loading}
                  onClick={applyOverdueIssuedInvoicesFilter}
                >
                  Прострочені
                </button>
              </div>
              <p className="meta">
                Чернетки — Draft. Виставлені — Issued. Прострочені — Issued зі строком оплати
                раніше за сьогоднішню календарну дату (класифікація строку, не оплати). Стан у
                URL.
              </p>
            </div>

            {overdueQueueActive ? (
              <div className="queue-banner" role="status">
                <p className="queue-banner-title">Черга: прострочені виставлені рахунки</p>
                <p className="meta">
                  Серверний фільтр: <span className="mono">status=Issued</span>, строк оплати по{" "}
                  <span className="mono">{effectiveDueToForSummary}</span> (включно; сьогоднішній
                  строк виключено). Це не статус оплати.
                </p>
              </div>
            ) : null}

            <form className="filter-form" onSubmit={applyFilters}>
              <label>
                Номер документа
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
                Контрагент
                <input
                  value={draftFilters.counterpartyReference ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      counterpartyReference: event.target.value
                    }))
                  }
                  placeholder="точне значення"
                  autoComplete="off"
                  title="Точний збіг з посиланням контрагента в API"
                />
              </label>
              <label>
                Статус
                <select
                  value={draftFilters.status ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: event.target.value as InvoiceStatusFilter
                    }))
                  }
                >
                  <option value="">Усі</option>
                  {INVOICE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Створено з
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
                Створено по
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
                Виставлено з
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
                Виставлено по
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
                Строк оплати з
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
                Строк оплати по
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
                  Застосувати
                </button>
                <button type="button" onClick={clearFilters} disabled={loading}>
                  {overdueQueueActive ? "Скинути чергу" : "Скинути"}
                </button>
              </div>
            </form>

            {filterValidationError ? (
              <StatusMessage tone="error">{filterValidationError}</StatusMessage>
            ) : null}
            {filtersActive ? (
              <p className="meta">
                Активні фільтри:
                {overdueQueueActive ? " черга прострочених" : ""}
                {appliedFilters.documentNumber?.trim()
                  ? ` номер «${appliedFilters.documentNumber.trim()}»`
                  : ""}
                {appliedFilters.counterpartyReference?.trim()
                  ? ` контрагент «${appliedFilters.counterpartyReference.trim()}»`
                  : ""}
                {appliedFilters.status === "Draft" || appliedFilters.status === "Issued"
                  ? ` статус ${appliedFilters.status}`
                  : ""}
                {appliedFilters.createdFromDate
                  ? ` створено з ${appliedFilters.createdFromDate}`
                  : ""}
                {appliedFilters.createdToDate
                  ? ` створено по ${appliedFilters.createdToDate}`
                  : ""}
                {appliedFilters.issuedFromDate
                  ? ` виставлено з ${appliedFilters.issuedFromDate}`
                  : ""}
                {appliedFilters.issuedToDate
                  ? ` виставлено по ${appliedFilters.issuedToDate}`
                  : ""}
                {appliedFilters.dueFromDate
                  ? ` строк з ${appliedFilters.dueFromDate}`
                  : ""}
                {effectiveDueToForSummary
                  ? ` строк по ${effectiveDueToForSummary}`
                  : ""}
              </p>
            ) : (
              <p className="meta">Фільтри не застосовані.</p>
            )}

            <form className="create-form" onSubmit={(event) => void handleCreateInvoice(event)}>
              <label>
                Номер документа
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
                Контрагент
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
                Валюта
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
                Створити чернетку
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
                Відкрити нарахування
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
              Додавання рядка: <span className="mono">{lineAddTarget.documentNumber}</span>
            </p>
            <label>
              Кількість
              <input
                value={lineAddQuantity}
                onChange={(event) => setLineAddQuantity(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineAddBusy}
              />
            </label>
            <label>
              Ціна
              <input
                value={lineAddUnitPrice}
                onChange={(event) => setLineAddUnitPrice(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineAddBusy}
              />
            </label>
            <label>
              Опис рядка
              <input
                value={lineAddDescription}
                onChange={(event) => setLineAddDescription(event.target.value)}
                placeholder="Послуга або товар"
                disabled={lineAddBusy}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={lineAddBusy || loading}>
                {lineAddBusy ? "Збереження…" : "Додати рядок"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={lineAddBusy}
                onClick={cancelLineAdd}
              >
                Скасувати
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
              Зміна рядка {draftInvoiceLineConfirmationLabel(lineUpdateTarget.line)}:{" "}
              <span className="mono">{lineUpdateTarget.invoice.documentNumber}</span>
            </p>
            <label>
              Кількість
              <input
                value={lineUpdateQuantity}
                onChange={(event) => setLineUpdateQuantity(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineUpdateBusy}
              />
            </label>
            <label>
              Ціна
              <input
                value={lineUpdateUnitPrice}
                onChange={(event) => setLineUpdateUnitPrice(event.target.value)}
                inputMode="decimal"
                required
                disabled={lineUpdateBusy}
              />
            </label>
            <label>
              Опис рядка
              <input
                value={lineUpdateDescription}
                onChange={(event) => setLineUpdateDescription(event.target.value)}
                placeholder="Послуга або товар"
                disabled={lineUpdateBusy}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={lineUpdateBusy || loading}>
                {lineUpdateBusy ? "Збереження…" : "Зберегти рядок"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={lineUpdateBusy}
                onClick={cancelLineUpdate}
              >
                Скасувати
              </button>
            </div>
          </form>
        ) : null}

        {workspace && lineRemoveTarget ? (
          <div className="create-form issue-prepare-form" role="group" aria-label="Підтвердження видалення рядка">
            <p className="meta">
              Видалити рядок {draftInvoiceLineConfirmationLabel(lineRemoveTarget.line)} з рахунка{" "}
              <span className="mono">{lineRemoveTarget.invoice.documentNumber}</span>?
            </p>
            <div className="filter-actions">
              <button
                type="button"
                disabled={lineRemoveBusy || loading}
                onClick={() => void handleConfirmLineRemove()}
              >
                {lineRemoveBusy ? "Видалення…" : "Підтвердити видалення"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={lineRemoveBusy}
                onClick={cancelLineRemove}
              >
                Скасувати
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
              Зміна дати оплати:{" "}
              <span className="mono">{dueDateEditTarget.documentNumber}</span>
            </p>
            <label>
              Дата оплати
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
                {dueDateEditBusy ? "Збереження…" : "Зберегти"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={dueDateEditBusy}
                onClick={cancelDueDateEdit}
              >
                Скасувати
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
              Підготовка до виставлення: <span className="mono">{issueTarget.documentNumber}</span>
            </p>
            {getInvoiceIssueReadiness(issueTarget).needsDueDate ? (
              <label>
                Дата оплати
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
                  Кількість
                  <input
                    value={issueQuantity}
                    onChange={(event) => setIssueQuantity(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label>
                  Ціна
                  <input
                    value={issueUnitPrice}
                    onChange={(event) => setIssueUnitPrice(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label>
                  Опис рядка
                  <input
                    value={issueLineDescription}
                    onChange={(event) => setIssueLineDescription(event.target.value)}
                    placeholder="Послуга або товар"
                  />
                </label>
              </>
            ) : null}
            <div className="filter-actions">
              <button type="submit" disabled={issueBusy}>
                Підготувати й виставити
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={issueBusy}
                onClick={cancelIssuePrepare}
              >
                Скасувати
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
          />
        ) : null}

        {workspace ? (
          <ListLoadState
            loading={loading}
            loadingMessage="Завантаження рахунків…"
            error={error}
            onRetry={() => void loadPage(workspace.id, page, appliedFilters, invoiceQueue)}
            retryDisabled={loading}
            empty={invoices.length === 0}
            emptyMessage={
              overdueQueueActive
                ? "Прострочених виставлених рахунків немає (строк оплати раніше за сьогодні)."
                : filtersActive
                  ? "За поточними фільтрами рахунків немає."
                  : "Рахунків ще немає. Створіть чернетку через форму вище."
            }
          />
        ) : null}

        {invoices.length > 0 ? (
          <>
            <p className="meta">
              Сторінка {page} · показано {invoices.length} · усього {totalCount}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Контрагент</th>
                    <th>Сума</th>
                    <th>Валюта</th>
                    <th>Виставлено</th>
                    <th>Строк оплати</th>
                    <th>Статус строку</th>
                    <th>Дні</th>
                    <th>Дія</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const aging = classifyDueDateAging(invoice.dueDateUtc);
                    return (
                    <tr
                      key={invoice.id}
                      data-row-id={invoice.id}
                      className={invoice.id === highlightedId ? "row-highlight" : undefined}
                    >
                      <td className="cell-wrap">{invoice.documentNumber}</td>
                      <td className="cell-wrap">{invoice.counterpartyReference}</td>
                      <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                      <td>{invoice.currency}</td>
                      <td>{formatDate(invoice.issuedAtUtc)}</td>
                      <td>{formatDate(invoice.dueDateUtc)}</td>
                      <td>
                        <span className={`aging-badge aging-badge--${aging.kind}`}>
                          {aging.label}
                        </span>
                      </td>
                      <td>{aging.dayOffsetLabel}</td>
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
                                ? "Завантаження…"
                                : "Деталі"}
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
                                ? "Збереження…"
                                : "Змінити реквізити"}
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
                                ? "Збереження…"
                                : "Додати рядок"}
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
                                ? "Збереження…"
                                : "Змінити дату"}
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
                              Виставити
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
                                ? "Створення…"
                                : "Створити нарахування"}
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
            <div className="pagination" role="navigation" aria-label="Сторінки рахунків">
              <button
                type="button"
                disabled={!canGoPrevious}
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  onDiscoveryChange?.(nextPage, appliedFilters, invoiceQueue);
                }}
              >
                Назад
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
                  onDiscoveryChange?.(nextPage, appliedFilters, invoiceQueue);
                }}
              >
                Далі
              </button>
            </div>
          </>
        ) : null}
      </Panel>
    </>
  );
}
