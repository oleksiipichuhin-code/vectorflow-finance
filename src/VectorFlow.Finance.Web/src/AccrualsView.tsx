import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  changeAccrualAmount,
  changeAccrualCurrency,
  changeAccrualDescription,
  changeAccrualRecognitionDate,
  changeAccrualSourceInvoice,
  changeAccrualType,
  createAccrual,
  getAccrual,
  getInvoice,
  listAccrualsPaged,
  recognizeAccrual,
  reverseAccrual,
  type Accrual,
  type FinanceWorkspace
} from "./api";
import {
  canViewAccrualDetails,
  detailReloadAfterMutationFailedMessage,
  interpretAccrualDetailLoadError,
  interpretSourceInvoiceDetailLoadError,
  shouldLoadSourceInvoice,
  shouldReloadDetailAfterMutation,
  sourceInvoiceDetailFromInvoice,
  sourceInvoiceDetailNone,
  type BeginEditorOptions,
  type SourceInvoiceDetailView
} from "./accrualDetail";
import {
  canEditAccrualAmount,
  formatAccrualAmountInput,
  interpretAccrualAmountEditError,
  parseAccrualAmountInput
} from "./accrualEditAmount";
import {
  ACCRUAL_PAGE_SIZE,
  ACCRUAL_STATUS_OPTIONS,
  buildAccrualListQuery,
  hasActiveAccrualFilters,
  totalPages,
  type AccrualListFilters,
  type AccrualStatusFilter
} from "./accrualListQuery";
import {
  canRecognizeAccrual,
  interpretAccrualRecognizeError
} from "./accrualRecognize";
import {
  REVERSAL_REASON_MAX_LENGTH,
  canReverseAccrual,
  interpretAccrualReverseError,
  normalizeReversalReason
} from "./accrualReverse";
import {
  canChangeAccrualSourceInvoice,
  formatAccrualSourceInvoiceListCell,
  formatSourceInvoiceSelection,
  interpretAccrualSourceInvoiceEditError,
  type InvoicePickerSummary
} from "./accrualSourceInvoice";
import { interpretCreateAccrualError } from "./accrualCreate";
import {
  applyDraftAccrualEditorChanges,
  canEditDraftAccrualDetails,
  interpretDraftAccrualEditorError,
  valuesFromAccrual,
  type DraftAccrualEditorValues
} from "./draftAccrualEditor";
import { EMPTY_ACCRUAL_FILTERS } from "./urlState";
import { AccrualDetailPanel } from "./components/AccrualDetailPanel";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import { DraftAccrualEditor } from "./components/DraftAccrualEditor";
import i18n from "./i18n";
import { formatDate, formatMoney } from "./i18n/format";
import { SourceInvoicePicker } from "./SourceInvoicePicker";

type AccrualIdChangeOptions = {
  replace?: boolean;
};

type AccrualsViewProps = {
  workspace: FinanceWorkspace | null;
  initialPage?: number;
  initialFilters?: AccrualListFilters;
  /** URL-owned detail target; authoritative data still comes from getAccrual. */
  selectedAccrualId?: string | null;
  onDiscoveryChange?: (page: number, filters: AccrualListFilters) => void;
  onSelectedAccrualIdChange?: (
    accrualId: string | null,
    options?: AccrualIdChangeOptions
  ) => void;
  /** Cross-view handoff: open Invoices detail for a linked source invoice. */
  onOpenInvoice?: (invoiceId: string) => void;
};

const emptyFilters: AccrualListFilters = { ...EMPTY_ACCRUAL_FILTERS };

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AccrualsView({
  workspace,
  initialPage = 1,
  initialFilters = emptyFilters,
  selectedAccrualId = null,
  onDiscoveryChange,
  onSelectedAccrualIdChange,
  onOpenInvoice
}: AccrualsViewProps) {
  const { t } = useTranslation(["finance", "common"]);
  const statusLabel = useCallback(
    (status: string) => {
      if (status === "Draft" || status === "Recognized" || status === "Reversed") {
        return t(`accrualStatus.${status}`);
      }

      return status;
    },
    [t]
  );
  const typeLabel = useCallback(
    (type: string) => {
      if (type === "Revenue" || type === "Expense") {
        return t(`type.${type}`);
      }

      return type;
    },
    [t]
  );
  const [draftFilters, setDraftFilters] = useState<AccrualListFilters>(() => ({
    ...emptyFilters,
    ...initialFilters
  }));
  const [appliedFilters, setAppliedFilters] = useState<AccrualListFilters>(() => ({
    ...emptyFilters,
    ...initialFilters
  }));
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);

  const [page, setPage] = useState(() => (initialPage < 1 ? 1 : Math.floor(initialPage)));
  const previousWorkspaceId = useRef<string | null>(null);
  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(ACCRUAL_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accrualType, setAccrualType] = useState("Revenue");
  const [accrualAmount, setAccrualAmount] = useState("100.00");
  const [accrualCurrency, setAccrualCurrency] = useState("UAH");
  const [accrualRecognitionDate, setAccrualRecognitionDate] = useState(todayDateInputValue);
  const [accrualDescription, setAccrualDescription] = useState(() =>
    i18n.t("accruals.defaultDescription", { ns: "finance" })
  );
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createSourceInvoiceId, setCreateSourceInvoiceId] = useState<string | null>(null);
  const [createSourceInvoiceDisplay, setCreateSourceInvoiceDisplay] =
    useState<InvoicePickerSummary | null>(null);
  const [createSourceInvoicePickerOpen, setCreateSourceInvoicePickerOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [recognizeError, setRecognizeError] = useState<string | null>(null);
  const [recognizeSuccess, setRecognizeSuccess] = useState<string | null>(null);
  const [recognizingIds, setRecognizingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [reverseTarget, setReverseTarget] = useState<Accrual | null>(null);
  const [reverseReason, setReverseReason] = useState("");
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reverseSuccess, setReverseSuccess] = useState<string | null>(null);
  const [reversingIds, setReversingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [editAmountTarget, setEditAmountTarget] = useState<Accrual | null>(null);
  const [editAmountValue, setEditAmountValue] = useState("");
  const [editAmountError, setEditAmountError] = useState<string | null>(null);
  const [editAmountSuccess, setEditAmountSuccess] = useState<string | null>(null);
  const [editingAmountIds, setEditingAmountIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [sourceInvoiceTarget, setSourceInvoiceTarget] = useState<Accrual | null>(null);
  const [sourceInvoiceError, setSourceInvoiceError] = useState<string | null>(null);
  const [sourceInvoiceSuccess, setSourceInvoiceSuccess] = useState<string | null>(null);
  const [changingSourceInvoiceIds, setChangingSourceInvoiceIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [draftDetailsTarget, setDraftDetailsTarget] = useState<Accrual | null>(null);
  const [draftDetailsBaseline, setDraftDetailsBaseline] =
    useState<DraftAccrualEditorValues | null>(null);
  const [draftDetailsError, setDraftDetailsError] = useState<string | null>(null);
  const [draftDetailsSuccess, setDraftDetailsSuccess] = useState<string | null>(null);
  const [editingDraftDetailsIds, setEditingDraftDetailsIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [detailAccrual, setDetailAccrual] = useState<Accrual | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailErrorRetryable, setDetailErrorRetryable] = useState(false);
  const [detailSourceInvoice, setDetailSourceInvoice] = useState<SourceInvoiceDetailView>(() =>
    sourceInvoiceDetailNone()
  );
  const [invoiceDisplayCache, setInvoiceDisplayCache] = useState<
    ReadonlyMap<string, InvoicePickerSummary>
  >(() => new Map());

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailInvoiceAbortRef = useRef<AbortController | null>(null);
  const detailRequestSeq = useRef(0);
  const detailInvoiceRequestSeq = useRef(0);
  const recognizingIdsRef = useRef<Set<string>>(new Set());
  const reversingIdsRef = useRef<Set<string>>(new Set());
  const editingAmountIdsRef = useRef<Set<string>>(new Set());
  const changingSourceInvoiceIdsRef = useRef<Set<string>>(new Set());
  const editingDraftDetailsIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (workspace) {
      setAccrualCurrency(workspace.defaultCurrency);
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
      setAccruals([]);
      setTotalCount(0);
      setError(null);
      setCreateError(null);
      setCreateSuccess(null);
      setCreateSourceInvoiceId(null);
      setCreateSourceInvoiceDisplay(null);
      setCreateSourceInvoicePickerOpen(false);
      setHighlightedId(null);
      setRecognizeError(null);
      setRecognizeSuccess(null);
      recognizingIdsRef.current = new Set();
      setRecognizingIds(new Set());
      setReverseTarget(null);
      setReverseReason("");
      setReverseError(null);
      setReverseSuccess(null);
      reversingIdsRef.current = new Set();
      setReversingIds(new Set());
      setEditAmountTarget(null);
      setEditAmountValue("");
      setEditAmountError(null);
      setEditAmountSuccess(null);
      editingAmountIdsRef.current = new Set();
      setEditingAmountIds(new Set());
      setSourceInvoiceTarget(null);
      setSourceInvoiceError(null);
      setSourceInvoiceSuccess(null);
      changingSourceInvoiceIdsRef.current = new Set();
      setChangingSourceInvoiceIds(new Set());
      setDraftDetailsTarget(null);
      setDraftDetailsBaseline(null);
      setDraftDetailsError(null);
      setDraftDetailsSuccess(null);
      editingDraftDetailsIdsRef.current = new Set();
      setEditingDraftDetailsIds(new Set());
      dismissDetailFromUrl({ replace: true });
      setInvoiceDisplayCache(new Map());
      onDiscoveryChange?.(1, emptyFilters);
    }
  }, [workspace?.id, onDiscoveryChange, onSelectedAccrualIdChange, selectedAccrualId]);

  const loadPage = useCallback(
    async (workspaceId: string, nextPage: number, filters: AccrualListFilters) => {
      const { query, validationError } = buildAccrualListQuery(
        nextPage,
        ACCRUAL_PAGE_SIZE,
        filters
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
        const result = await listAccrualsPaged(workspaceId, query, controller.signal);
        if (seq !== requestSeq.current) {
          return;
        }

        setAccruals(result.items);
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

        setAccruals([]);
        setTotalCount(0);
        setError(
          loadError instanceof Error
            ? loadError.message
            : i18n.t("accruals.error.listLoadFailed", { ns: "finance" })
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

    void loadPage(workspace.id, page, appliedFilters);

    return () => {
      abortRef.current?.abort();
    };
  }, [workspace, page, appliedFilters, loadPage]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { validationError } = buildAccrualListQuery(1, ACCRUAL_PAGE_SIZE, draftFilters);
    if (validationError) {
      setFilterValidationError(validationError);
      return;
    }

    setFilterValidationError(null);
    setPage(1);
    setAppliedFilters({ ...draftFilters });
    onDiscoveryChange?.(1, { ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, emptyFilters);
  }

  async function handleCreateAccrual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || createBusy) {
      return;
    }

    const amount = Number(accrualAmount.replace(",", "."));
    if (!Number.isFinite(amount)) {
      setCreateError(t("accruals.error.amountNumeric"));
      return;
    }

    setCreateBusy(true);
    setCreateError(null);
    setCreateSuccess(null);
    setRecognizeError(null);
    setRecognizeSuccess(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setCreateSourceInvoicePickerOpen(false);
    dismissDetailFromUrl();

    const selectedSource = createSourceInvoiceDisplay;
    const selectedSourceId = createSourceInvoiceId;

    try {
      const created = await createAccrual(workspace.id, {
        type: accrualType,
        amount,
        currency: accrualCurrency,
        recognitionDateUtc: new Date(`${accrualRecognitionDate}T00:00:00.000Z`).toISOString(),
        description: accrualDescription,
        sourceInvoiceId: selectedSourceId
      });
      setHighlightedId(created.id);
      if (created.sourceInvoiceId && selectedSource) {
        setInvoiceDisplayCache((current) => {
          const next = new Map(current);
          next.set(selectedSource.id, selectedSource);
          return next;
        });
      }
      setCreateSourceInvoiceId(null);
      setCreateSourceInvoiceDisplay(null);
      setCreateSuccess(
        created.sourceInvoiceId
          ? t("accruals.createSuccessWithSource", { description: created.description })
          : t("accruals.createSuccess", { description: created.description })
      );
      await loadPage(workspace.id, page, appliedFilters);
    } catch (createErr) {
      const failure = interpretCreateAccrualError(createErr);
      setCreateError(failure.message);
      if (failure.clearSourceInvoiceSelection) {
        setCreateSourceInvoiceId(null);
        setCreateSourceInvoiceDisplay(null);
      }
    } finally {
      setCreateBusy(false);
    }
  }

  function beginCreateSourceInvoicePicker() {
    if (!workspace || createBusy) {
      return;
    }

    setCreateError(null);
    setCreateSuccess(null);
    setRecognizeError(null);
    setRecognizeSuccess(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    dismissDetailFromUrl();
    setCreateSourceInvoicePickerOpen(true);
  }

  function clearCreateSourceInvoiceSelection() {
    if (createBusy) {
      return;
    }

    setCreateSourceInvoiceId(null);
    setCreateSourceInvoiceDisplay(null);
  }

  function confirmCreateSourceInvoiceSelection(
    sourceInvoiceId: string | null,
    selected: InvoicePickerSummary | null
  ) {
    setCreateSourceInvoiceId(sourceInvoiceId);
    setCreateSourceInvoiceDisplay(selected);
    setCreateSourceInvoicePickerOpen(false);
  }

  function cancelCreateSourceInvoicePicker() {
    if (createBusy) {
      return;
    }

    setCreateSourceInvoicePickerOpen(false);
  }

  async function handleRecognizeAccrual(
    accrual: Accrual,
    options: BeginEditorOptions = {}
  ) {
    if (!workspace || !canRecognizeAccrual(accrual)) {
      return;
    }

    if (
      recognizingIdsRef.current.has(accrual.id) ||
      reversingIdsRef.current.has(accrual.id)
    ) {
      return;
    }

    recognizingIdsRef.current.add(accrual.id);
    setRecognizingIds(new Set(recognizingIdsRef.current));
    setCreateSuccess(null);
    setRecognizeError(null);
    setRecognizeSuccess(null);
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setReverseTarget(null);
    setReverseReason("");
    setReverseError(null);
    setReverseSuccess(null);
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }

    try {
      const recognized = await recognizeAccrual(workspace.id, accrual.id);
      setHighlightedId(recognized.id);
      setRecognizeSuccess(
        t("accruals.recognizeSuccess", {
          description: recognized.description,
          status: statusLabel(recognized.status)
        })
      );
      await loadPage(workspace.id, page, appliedFilters);
      await refreshDetailAfterMutation(recognized.id);
    } catch (recognizeErr) {
      const failure = interpretAccrualRecognizeError(recognizeErr);
      setRecognizeError(failure.message);
      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters);
          await refreshDetailAfterEditorFailure(accrual.id);
        } catch {
          // Keep the recognize error; list refresh failure is secondary.
        }
      }
    } finally {
      recognizingIdsRef.current.delete(accrual.id);
      setRecognizingIds(new Set(recognizingIdsRef.current));
    }
  }

  function beginReverse(accrual: Accrual, options: BeginEditorOptions = {}) {
    if (
      !canReverseAccrual(accrual) ||
      reversingIdsRef.current.has(accrual.id) ||
      recognizingIdsRef.current.has(accrual.id)
    ) {
      return;
    }

    if (reverseTarget?.id === accrual.id) {
      return;
    }

    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setCreateSourceInvoicePickerOpen(false);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }
    setReverseTarget(accrual);
    setReverseReason("");
  }

  function cancelReverse() {
    if (reverseTarget && reversingIdsRef.current.has(reverseTarget.id)) {
      return;
    }

    setReverseTarget(null);
    setReverseReason("");
    setReverseError(null);
  }

  function beginEditAmount(accrual: Accrual, options: BeginEditorOptions = {}) {
    if (!canEditAccrualAmount(accrual) || editingAmountIdsRef.current.has(accrual.id)) {
      return;
    }

    if (editAmountTarget?.id === accrual.id) {
      return;
    }

    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setCreateSourceInvoicePickerOpen(false);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(accrual);
    setEditAmountValue(formatAccrualAmountInput(accrual.amount));
  }

  function cancelEditAmount() {
    if (editAmountTarget && editingAmountIdsRef.current.has(editAmountTarget.id)) {
      return;
    }

    setEditAmountTarget(null);
    setEditAmountValue("");
    setEditAmountError(null);
  }

  function beginChangeSourceInvoice(accrual: Accrual, options: BeginEditorOptions = {}) {
    if (
      !canChangeAccrualSourceInvoice(accrual) ||
      changingSourceInvoiceIdsRef.current.has(accrual.id)
    ) {
      return;
    }

    if (sourceInvoiceTarget?.id === accrual.id) {
      return;
    }

    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setCreateSourceInvoicePickerOpen(false);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(accrual);
  }

  function cancelChangeSourceInvoice() {
    if (
      sourceInvoiceTarget &&
      changingSourceInvoiceIdsRef.current.has(sourceInvoiceTarget.id)
    ) {
      return;
    }

    setSourceInvoiceTarget(null);
    setSourceInvoiceError(null);
  }

  function beginEditDraftDetails(accrual: Accrual, options: BeginEditorOptions = {}) {
    if (
      !canEditDraftAccrualDetails(accrual) ||
      editingDraftDetailsIdsRef.current.has(accrual.id)
    ) {
      return;
    }

    if (draftDetailsTarget?.id === accrual.id) {
      return;
    }

    const baseline = valuesFromAccrual(accrual);
    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setCreateSourceInvoicePickerOpen(false);
    if (!options.preserveDetail) {
      dismissDetailFromUrl();
    }
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(accrual);
    setDraftDetailsBaseline(baseline);
  }

  function cancelEditDraftDetails() {
    if (
      draftDetailsTarget &&
      editingDraftDetailsIdsRef.current.has(draftDetailsTarget.id)
    ) {
      return;
    }

    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setDraftDetailsError(null);
  }

  function clearDetailPanel() {
    detailAbortRef.current?.abort();
    detailInvoiceAbortRef.current?.abort();
    setDetailTargetId(null);
    setDetailAccrual(null);
    setDetailLoading(false);
    setDetailError(null);
    setDetailErrorRetryable(false);
    setDetailSourceInvoice(sourceInvoiceDetailNone());
  }

  /** Close detail locally and drop accrualId from URL when it was open. */
  function dismissDetailFromUrl(options: AccrualIdChangeOptions = {}) {
    clearDetailPanel();
    if (selectedAccrualId) {
      onSelectedAccrualIdChange?.(null, options);
    }
  }

  function isDetailRelatedEditorPending(): boolean {
    if (!detailTargetId) {
      return false;
    }

    return (
      editingAmountIdsRef.current.has(detailTargetId) ||
      changingSourceInvoiceIdsRef.current.has(detailTargetId) ||
      editingDraftDetailsIdsRef.current.has(detailTargetId) ||
      recognizingIdsRef.current.has(detailTargetId) ||
      reversingIdsRef.current.has(detailTargetId)
    );
  }

  function closeOpenEditorsForDetailClose() {
    setEditAmountTarget(null);
    setEditAmountValue("");
    setEditAmountError(null);
    setSourceInvoiceTarget(null);
    setSourceInvoiceError(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setDraftDetailsError(null);
    setReverseTarget(null);
    setReverseReason("");
    setReverseError(null);
  }

  function closeDetailPanel() {
    if (isDetailRelatedEditorPending()) {
      return;
    }

    closeOpenEditorsForDetailClose();
    dismissDetailFromUrl();
  }

  /**
   * URL is the navigation source for which detail is open.
   * getAccrual remains authoritative for panel data.
   */
  useEffect(() => {
    if (!workspace) {
      return;
    }

    if (!selectedAccrualId) {
      if (detailTargetId !== null && !isDetailRelatedEditorPending()) {
        closeOpenEditorsForDetailClose();
        clearDetailPanel();
      }
      return;
    }

    if (detailTargetId === selectedAccrualId) {
      return;
    }

    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setCreateSourceInvoicePickerOpen(false);

    void loadAccrualDetail(workspace.id, selectedAccrualId);
    // loadAccrualDetail is stable enough via refs; intentionally keyed on selection + workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid reload loops on detail state
  }, [workspace?.id, selectedAccrualId]);

  async function refreshDetailAfterMutation(accrualId: string) {
    if (!workspace || !shouldReloadDetailAfterMutation(detailTargetId, accrualId)) {
      return;
    }

    await loadAccrualDetail(workspace.id, accrualId, { afterSuccessfulMutation: true });
  }

  async function refreshDetailAfterEditorFailure(accrualId: string) {
    if (!workspace || !shouldReloadDetailAfterMutation(detailTargetId, accrualId)) {
      return;
    }

    await loadAccrualDetail(workspace.id, accrualId);
  }

  async function loadDetailSourceInvoice(
    workspaceId: string,
    sourceInvoiceId: string,
    expectedDetailSeq: number
  ) {
    detailInvoiceAbortRef.current?.abort();
    const controller = new AbortController();
    detailInvoiceAbortRef.current = controller;
    const invoiceSeq = ++detailInvoiceRequestSeq.current;
    setDetailSourceInvoice({ kind: "loading" });

    try {
      const invoice = await getInvoice(workspaceId, sourceInvoiceId, controller.signal);
      if (
        invoiceSeq !== detailInvoiceRequestSeq.current ||
        expectedDetailSeq !== detailRequestSeq.current
      ) {
        return;
      }

      const view = sourceInvoiceDetailFromInvoice(invoice);
      setDetailSourceInvoice(view);
      if (view.kind === "ready") {
        setInvoiceDisplayCache((current) => {
          const next = new Map(current);
          next.set(view.invoice.id, view.invoice);
          return next;
        });
      }
    } catch (invoiceError) {
      if (
        invoiceSeq !== detailInvoiceRequestSeq.current ||
        expectedDetailSeq !== detailRequestSeq.current
      ) {
        return;
      }

      if (invoiceError instanceof DOMException && invoiceError.name === "AbortError") {
        return;
      }

      const failure = interpretSourceInvoiceDetailLoadError(invoiceError);
      if (failure.kind === "not_found") {
        setDetailSourceInvoice({
          kind: "unavailable",
          message: failure.message
        });
        return;
      }

      setDetailSourceInvoice({
        kind: "error",
        message: failure.message,
        retryable: true
      });
    }
  }

  async function loadAccrualDetail(
    workspaceId: string,
    accrualId: string,
    options: { afterSuccessfulMutation?: boolean } = {}
  ) {
    detailAbortRef.current?.abort();
    detailInvoiceAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    const seq = ++detailRequestSeq.current;

    setDetailTargetId(accrualId);
    setDetailAccrual(null);
    setDetailLoading(true);
    setDetailError(null);
    setDetailErrorRetryable(false);
    setDetailSourceInvoice(sourceInvoiceDetailNone());

    try {
      const accrual = await getAccrual(workspaceId, accrualId, controller.signal);
      if (seq !== detailRequestSeq.current) {
        return;
      }

      setDetailAccrual(accrual);
      setDetailLoading(false);
      setDetailError(null);
      setDetailErrorRetryable(false);

      if (shouldLoadSourceInvoice(accrual.sourceInvoiceId)) {
        await loadDetailSourceInvoice(workspaceId, accrual.sourceInvoiceId, seq);
      } else {
        setDetailSourceInvoice(sourceInvoiceDetailNone());
      }
    } catch (loadError) {
      if (seq !== detailRequestSeq.current) {
        return;
      }

      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      const failure = interpretAccrualDetailLoadError(loadError);
      if (failure.clearAccrualData) {
        setDetailAccrual(null);
        setDetailSourceInvoice(sourceInvoiceDetailNone());
      }

      setDetailLoading(false);
      if (options.afterSuccessfulMutation && failure.kind === "retryable") {
        setDetailError(detailReloadAfterMutationFailedMessage());
        setDetailErrorRetryable(true);
      } else {
        setDetailError(failure.message);
        setDetailErrorRetryable(failure.kind === "retryable");
      }

      if (failure.refreshList) {
        await loadPage(workspaceId, page, appliedFilters);
      }
    }
  }

  function beginViewAccrualDetails(accrual: Accrual) {
    if (!workspace || !canViewAccrualDetails(accrual)) {
      return;
    }

    if (selectedAccrualId === accrual.id && detailTargetId === accrual.id) {
      return;
    }

    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setReverseTarget(null);
    setReverseReason("");
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);
    setCreateSourceInvoicePickerOpen(false);

    onSelectedAccrualIdChange?.(accrual.id);
  }

  function retryAccrualDetail() {
    if (!workspace || !detailTargetId || !detailErrorRetryable) {
      return;
    }

    void loadAccrualDetail(workspace.id, detailTargetId);
  }

  function retryDetailSourceInvoice() {
    if (
      !workspace ||
      !detailAccrual ||
      !shouldLoadSourceInvoice(detailAccrual.sourceInvoiceId) ||
      detailSourceInvoice.kind !== "error"
    ) {
      return;
    }

    void loadDetailSourceInvoice(
      workspace.id,
      detailAccrual.sourceInvoiceId,
      detailRequestSeq.current
    );
  }

  async function handleEditDraftDetails(values: DraftAccrualEditorValues) {
    if (
      !workspace ||
      !draftDetailsTarget ||
      !draftDetailsBaseline ||
      !canEditDraftAccrualDetails(draftDetailsTarget)
    ) {
      return;
    }

    if (editingDraftDetailsIdsRef.current.has(draftDetailsTarget.id)) {
      return;
    }

    const target = draftDetailsTarget;
    const baseline = draftDetailsBaseline;
    editingDraftDetailsIdsRef.current.add(target.id);
    setEditingDraftDetailsIds(new Set(editingDraftDetailsIdsRef.current));
    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);

    try {
      const updated = await applyDraftAccrualEditorChanges(
        workspace.id,
        target.id,
        baseline,
        values,
        {
          changeDescription: changeAccrualDescription,
          changeRecognitionDate: changeAccrualRecognitionDate,
          changeType: changeAccrualType,
          changeCurrency: changeAccrualCurrency
        }
      );

      setDraftDetailsTarget(null);
      setDraftDetailsBaseline(null);

      if (!updated) {
        return;
      }

      setHighlightedId(updated.id);
      setDraftDetailsSuccess(
        t("accruals.detailsUpdateSuccess", { description: updated.description })
      );
      await loadPage(workspace.id, page, appliedFilters);
      await refreshDetailAfterMutation(updated.id);
    } catch (editErr) {
      const failure = interpretDraftAccrualEditorError(editErr);
      setDraftDetailsError(failure.message);
      if (!failure.keepEditorOpen) {
        setDraftDetailsTarget(null);
        setDraftDetailsBaseline(null);
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the editor error; list refresh failure is secondary.
        }
      }
    } finally {
      editingDraftDetailsIdsRef.current.delete(target.id);
      setEditingDraftDetailsIds(new Set(editingDraftDetailsIdsRef.current));
    }
  }

  async function handleChangeSourceInvoice(
    sourceInvoiceId: string | null,
    selected: InvoicePickerSummary | null
  ) {
    if (!workspace || !sourceInvoiceTarget || !canChangeAccrualSourceInvoice(sourceInvoiceTarget)) {
      return;
    }

    if (changingSourceInvoiceIdsRef.current.has(sourceInvoiceTarget.id)) {
      return;
    }

    const target = sourceInvoiceTarget;
    changingSourceInvoiceIdsRef.current.add(target.id);
    setChangingSourceInvoiceIds(new Set(changingSourceInvoiceIdsRef.current));
    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);

    try {
      const updated = await changeAccrualSourceInvoice(
        workspace.id,
        target.id,
        sourceInvoiceId
      );
      setSourceInvoiceTarget(null);
      setHighlightedId(updated.id);
      if (selected) {
        setInvoiceDisplayCache((current) => {
          const next = new Map(current);
          next.set(selected.id, selected);
          return next;
        });
        setSourceInvoiceSuccess(
          t("accruals.sourceInvoiceUpdateSuccess", {
            description: updated.description,
            document: selected.documentNumber
          })
        );
      } else {
        setSourceInvoiceSuccess(
          t("accruals.sourceInvoiceClearedSuccess", { description: updated.description })
        );
      }
      await loadPage(workspace.id, page, appliedFilters);
      await refreshDetailAfterMutation(updated.id);
    } catch (sourceErr) {
      const failure = interpretAccrualSourceInvoiceEditError(sourceErr);
      setSourceInvoiceError(failure.message);
      if (!failure.keepEditorOpen) {
        setSourceInvoiceTarget(null);
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the source-invoice error; list refresh failure is secondary.
        }
      }
    } finally {
      changingSourceInvoiceIdsRef.current.delete(target.id);
      setChangingSourceInvoiceIds(new Set(changingSourceInvoiceIdsRef.current));
    }
  }

  async function handleEditAmount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !editAmountTarget || !canEditAccrualAmount(editAmountTarget)) {
      return;
    }

    if (editingAmountIdsRef.current.has(editAmountTarget.id)) {
      return;
    }

    let amount: number;
    try {
      amount = parseAccrualAmountInput(editAmountValue);
    } catch (validationErr) {
      setEditAmountError(
        validationErr instanceof Error
          ? validationErr.message
          : t("accruals.error.checkAmount")
      );
      return;
    }

    const target = editAmountTarget;
    editingAmountIdsRef.current.add(target.id);
    setEditingAmountIds(new Set(editingAmountIdsRef.current));
    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);

    try {
      const updated = await changeAccrualAmount(workspace.id, target.id, amount);
      setEditAmountTarget(null);
      setEditAmountValue("");
      setHighlightedId(updated.id);
      setEditAmountSuccess(
        t("accruals.amountUpdateSuccess", {
          description: updated.description,
          amount: formatMoney(updated.amount, updated.currency)
        })
      );
      await loadPage(workspace.id, page, appliedFilters);
      await refreshDetailAfterMutation(updated.id);
    } catch (editErr) {
      const failure = interpretAccrualAmountEditError(editErr);
      setEditAmountError(failure.message);
      if (!failure.keepEditorOpen) {
        setEditAmountTarget(null);
        setEditAmountValue("");
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the edit error; list refresh failure is secondary.
        }
      }
    } finally {
      editingAmountIdsRef.current.delete(target.id);
      setEditingAmountIds(new Set(editingAmountIdsRef.current));
    }
  }

  async function handleReverseAccrual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !reverseTarget || !canReverseAccrual(reverseTarget)) {
      return;
    }

    if (reversingIdsRef.current.has(reverseTarget.id)) {
      return;
    }

    let reason: string;
    try {
      reason = normalizeReversalReason(reverseReason);
    } catch (validationErr) {
      setReverseError(
        validationErr instanceof Error
          ? validationErr.message
          : t("accruals.error.checkReversalReason")
      );
      return;
    }

    const target = reverseTarget;
    reversingIdsRef.current.add(target.id);
    setReversingIds(new Set(reversingIdsRef.current));
    setCreateSuccess(null);
    setRecognizeSuccess(null);
    setRecognizeError(null);
    setReverseError(null);
    setReverseSuccess(null);
    setEditAmountError(null);
    setEditAmountSuccess(null);
    setEditAmountTarget(null);
    setEditAmountValue("");
    setSourceInvoiceError(null);
    setSourceInvoiceSuccess(null);
    setSourceInvoiceTarget(null);
    setDraftDetailsError(null);
    setDraftDetailsSuccess(null);
    setDraftDetailsTarget(null);
    setDraftDetailsBaseline(null);

    try {
      const reversed = await reverseAccrual(workspace.id, target.id, reason);
      setReverseTarget(null);
      setReverseReason("");
      setHighlightedId(reversed.id);
      setReverseSuccess(
        t("accruals.reverseSuccess", {
          description: reversed.description,
          status: statusLabel(reversed.status)
        })
      );
      await loadPage(workspace.id, page, appliedFilters);
      await refreshDetailAfterMutation(reversed.id);
    } catch (reverseErr) {
      const failure = interpretAccrualReverseError(reverseErr);
      setReverseError(failure.message);
      if (!failure.keepEditorOpen) {
        setReverseTarget(null);
        setReverseReason("");
      }

      if (failure.refreshList) {
        try {
          await loadPage(workspace.id, page, appliedFilters);
          await refreshDetailAfterEditorFailure(target.id);
        } catch {
          // Keep the reverse error; list refresh failure is secondary.
        }
      }
    } finally {
      reversingIdsRef.current.delete(target.id);
      setReversingIds(new Set(reversingIdsRef.current));
    }
  }

  useEffect(() => {
    if (!highlightedId || accruals.length === 0) {
      return;
    }

    const row = document.querySelector(`[data-row-id="${highlightedId}"]`);
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlightedId, accruals]);

  const pages = totalPages(totalCount, pageSize);
  const canGoPrevious = page > 1 && !loading;
  const canGoNext = page < pages && !loading;
  const filtersActive = hasActiveAccrualFilters(appliedFilters);
  const detailEditorPending = Boolean(
    detailTargetId &&
      (editingAmountIds.has(detailTargetId) ||
        changingSourceInvoiceIds.has(detailTargetId) ||
        editingDraftDetailsIds.has(detailTargetId) ||
        recognizingIds.has(detailTargetId) ||
        reversingIds.has(detailTargetId))
  );
  const detailEditActionsDisabled = detailLoading || detailEditorPending;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>{t("accruals.title")}</h1>
        <p className="lede">{t("accruals.lede")}</p>
      </header>

      <Panel
        title={t("accruals.panelTitle")}
        headingId="accruals-heading"
        actions={
          <button
            type="button"
            onClick={() => workspace && void loadPage(workspace.id, page, appliedFilters)}
            disabled={!workspace || loading}
          >
            {t("refresh", { ns: "common" })}
          </button>
        }
      >
        {!workspace ? (
          <StatusMessage>{t("accruals.needWorkspace")}</StatusMessage>
        ) : (
          <>
            <p className="meta">
              {t("accruals.workspaceMeta", { name: workspace.name })} ·{" "}
              <span className="mono">{workspace.id}</span>
            </p>

            <form className="filter-form" onSubmit={applyFilters}>
              <label>
                {t("accruals.field.descriptionPrefix")}
                <input
                  value={draftFilters.descriptionPrefix ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      descriptionPrefix: event.target.value
                    }))
                  }
                  placeholder={t("accruals.descriptionPrefixPlaceholder")}
                  autoComplete="off"
                />
              </label>
              <label>
                {t("accruals.field.status")}
                <select
                  value={draftFilters.status ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: event.target.value as AccrualStatusFilter
                    }))
                  }
                >
                  <option value="">{t("all", { ns: "common" })}</option>
                  {ACCRUAL_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("accruals.field.recognitionFrom")}
                <input
                  type="date"
                  value={draftFilters.recognitionFromDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      recognitionFromDate: event.target.value
                    }))
                  }
                />
              </label>
              <label>
                {t("accruals.field.recognitionTo")}
                <input
                  type="date"
                  value={draftFilters.recognitionToDate ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      recognitionToDate: event.target.value
                    }))
                  }
                />
              </label>
              <div className="filter-actions">
                <button type="submit" disabled={loading}>
                  {t("accruals.applyAction")}
                </button>
                <button type="button" onClick={clearFilters} disabled={loading}>
                  {t("clearFilter", { ns: "common" })}
                </button>
              </div>
            </form>

            {filterValidationError ? (
              <StatusMessage tone="error">{filterValidationError}</StatusMessage>
            ) : null}
            {filtersActive ? (
              <p className="meta">
                {t("accruals.filter.activePrefix")}
                {appliedFilters.descriptionPrefix?.trim()
                  ? t("accruals.filter.activeDescription", {
                      value: appliedFilters.descriptionPrefix.trim()
                    })
                  : ""}
                {appliedFilters.status === "Draft" ||
                appliedFilters.status === "Recognized" ||
                appliedFilters.status === "Reversed"
                  ? t("accruals.filter.activeStatus", {
                      value: statusLabel(appliedFilters.status)
                    })
                  : ""}
                {appliedFilters.recognitionFromDate
                  ? t("accruals.filter.activeRecognitionFrom", {
                      value: appliedFilters.recognitionFromDate
                    })
                  : ""}
                {appliedFilters.recognitionToDate
                  ? t("accruals.filter.activeRecognitionTo", {
                      value: appliedFilters.recognitionToDate
                    })
                  : ""}
              </p>
            ) : (
              <p className="meta">{t("accruals.filter.none")}</p>
            )}

            <form className="create-form create-form-accrual" onSubmit={(event) => void handleCreateAccrual(event)}>
              <label>
                {t("accruals.field.type")}
                <select
                  value={accrualType}
                  onChange={(event) => setAccrualType(event.target.value)}
                  disabled={createBusy || createSourceInvoicePickerOpen}
                >
                  <option value="Revenue">{t("type.Revenue")}</option>
                  <option value="Expense">{t("type.Expense")}</option>
                </select>
              </label>
              <label>
                {t("accruals.field.amount")}
                <input
                  value={accrualAmount}
                  onChange={(event) => setAccrualAmount(event.target.value)}
                  inputMode="decimal"
                  required
                  disabled={createBusy || createSourceInvoicePickerOpen}
                />
              </label>
              <label>
                {t("accruals.field.currency")}
                <input
                  value={accrualCurrency}
                  onChange={(event) => setAccrualCurrency(event.target.value.toUpperCase())}
                  maxLength={3}
                  required
                  disabled={createBusy || createSourceInvoicePickerOpen}
                />
              </label>
              <label>
                {t("accruals.field.recognitionDate")}
                <input
                  type="date"
                  value={accrualRecognitionDate}
                  onChange={(event) => setAccrualRecognitionDate(event.target.value)}
                  required
                  disabled={createBusy || createSourceInvoicePickerOpen}
                />
              </label>
              <label>
                {t("accruals.field.description")}
                <input
                  value={accrualDescription}
                  onChange={(event) => setAccrualDescription(event.target.value)}
                  required
                  disabled={createBusy || createSourceInvoicePickerOpen}
                />
              </label>
              <div className="create-source-invoice">
                <p className="meta">
                  {t("accruals.sourceInvoiceOptional")}{" "}
                  <span className="cell-wrap">
                    {formatSourceInvoiceSelection(createSourceInvoiceDisplay)}
                  </span>
                </p>
                <div className="filter-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={createBusy || createSourceInvoicePickerOpen}
                    onClick={beginCreateSourceInvoicePicker}
                  >
                    {t("accruals.selectInvoice")}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={
                      createBusy ||
                      createSourceInvoicePickerOpen ||
                      createSourceInvoiceId === null
                    }
                    onClick={clearCreateSourceInvoiceSelection}
                  >
                    {t("accruals.clearSelection")}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={createBusy || createSourceInvoicePickerOpen}>
                {createBusy ? t("creating", { ns: "common" }) : t("accruals.createDraft")}
              </button>
            </form>
          </>
        )}

        {createError ? <StatusMessage tone="error">{createError}</StatusMessage> : null}
        {createSuccess ? <StatusMessage tone="success">{createSuccess}</StatusMessage> : null}
        {recognizeError ? <StatusMessage tone="error">{recognizeError}</StatusMessage> : null}
        {recognizeSuccess ? (
          <StatusMessage tone="success">{recognizeSuccess}</StatusMessage>
        ) : null}
        {editAmountError ? <StatusMessage tone="error">{editAmountError}</StatusMessage> : null}
        {editAmountSuccess ? (
          <StatusMessage tone="success">{editAmountSuccess}</StatusMessage>
        ) : null}
        {sourceInvoiceError && !sourceInvoiceTarget ? (
          <StatusMessage tone="error">{sourceInvoiceError}</StatusMessage>
        ) : null}
        {sourceInvoiceSuccess ? (
          <StatusMessage tone="success">{sourceInvoiceSuccess}</StatusMessage>
        ) : null}
        {draftDetailsError && !draftDetailsTarget ? (
          <StatusMessage tone="error">{draftDetailsError}</StatusMessage>
        ) : null}
        {draftDetailsSuccess ? (
          <StatusMessage tone="success">{draftDetailsSuccess}</StatusMessage>
        ) : null}
        {reverseError ? <StatusMessage tone="error">{reverseError}</StatusMessage> : null}
        {reverseSuccess ? <StatusMessage tone="success">{reverseSuccess}</StatusMessage> : null}

        {workspace && createSourceInvoicePickerOpen ? (
          <SourceInvoicePicker
            workspaceId={workspace.id}
            accrualDescription={
              accrualDescription.trim() || t("accruals.newAccrualFallback")
            }
            baselineInvoiceId={createSourceInvoiceId}
            busy={createBusy}
            formError={null}
            headingPrefix={t("accruals.picker.createHeadingPrefix")}
            confirmLabel={t("accruals.picker.confirmLabel")}
            confirmBusyLabel={t("accruals.picker.confirmBusyLabel")}
            onSave={confirmCreateSourceInvoiceSelection}
            onCancel={cancelCreateSourceInvoicePicker}
          />
        ) : null}

        {workspace && editAmountTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleEditAmount(event)}
          >
            <p className="meta">
              {t("accruals.amountEditor.intro")}{" "}
              <span className="cell-wrap">{editAmountTarget.description}</span>
              {" · "}
              {editAmountTarget.currency}
            </p>
            <label>
              {t("accruals.field.amount")}
              <input
                value={editAmountValue}
                onChange={(event) => setEditAmountValue(event.target.value)}
                inputMode="decimal"
                required
                disabled={editingAmountIds.has(editAmountTarget.id)}
                aria-label={t("accruals.amountEditor.amountAria")}
              />
            </label>
            <div className="filter-actions">
              <button
                type="submit"
                disabled={editingAmountIds.has(editAmountTarget.id) || loading}
              >
                {editingAmountIds.has(editAmountTarget.id)
                  ? t("saving", { ns: "common" })
                  : t("save", { ns: "common" })}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={editingAmountIds.has(editAmountTarget.id)}
                onClick={cancelEditAmount}
              >
                {t("cancel", { ns: "common" })}
              </button>
            </div>
          </form>
        ) : null}

        {workspace && draftDetailsTarget && draftDetailsBaseline ? (
          <DraftAccrualEditor
            key={draftDetailsTarget.id}
            accrualDescription={draftDetailsTarget.description}
            initialValues={draftDetailsBaseline}
            busy={editingDraftDetailsIds.has(draftDetailsTarget.id)}
            formError={draftDetailsError}
            onSave={(values) => void handleEditDraftDetails(values)}
            onCancel={cancelEditDraftDetails}
          />
        ) : null}

        {workspace && sourceInvoiceTarget ? (
          <SourceInvoicePicker
            workspaceId={workspace.id}
            accrualDescription={sourceInvoiceTarget.description}
            baselineInvoiceId={sourceInvoiceTarget.sourceInvoiceId}
            busy={changingSourceInvoiceIds.has(sourceInvoiceTarget.id)}
            formError={sourceInvoiceError}
            onSave={(sourceInvoiceId, selected) =>
              void handleChangeSourceInvoice(sourceInvoiceId, selected)
            }
            onCancel={cancelChangeSourceInvoice}
          />
        ) : null}

        {workspace && reverseTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleReverseAccrual(event)}
          >
            <p className="meta">
              {t("accruals.reverseEditor.intro")}{" "}
              <span className="cell-wrap">{reverseTarget.description}</span>
            </p>
            <label>
              {t("accruals.field.reversalReason")}
              <input
                value={reverseReason}
                onChange={(event) => setReverseReason(event.target.value)}
                maxLength={REVERSAL_REASON_MAX_LENGTH}
                required
                disabled={reversingIds.has(reverseTarget.id)}
                placeholder={t("accruals.reverseEditor.reasonPlaceholder")}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={reversingIds.has(reverseTarget.id) || loading}>
                {reversingIds.has(reverseTarget.id)
                  ? t("accruals.reversingAction")
                  : t("accruals.reverseAction")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={reversingIds.has(reverseTarget.id)}
                onClick={cancelReverse}
              >
                {t("cancel", { ns: "common" })}
              </button>
            </div>
          </form>
        ) : null}

        {workspace && detailTargetId ? (
          <AccrualDetailPanel
            accrual={detailAccrual}
            loading={detailLoading}
            error={detailError}
            errorRetryable={detailErrorRetryable}
            sourceInvoice={detailSourceInvoice}
            editActionsDisabled={detailEditActionsDisabled}
            recognizeBusy={Boolean(
              detailTargetId && recognizingIds.has(detailTargetId)
            )}
            reverseBusy={Boolean(detailTargetId && reversingIds.has(detailTargetId))}
            reverseOpen={Boolean(
              detailAccrual && reverseTarget?.id === detailAccrual.id
            )}
            onClose={closeDetailPanel}
            onRetry={retryAccrualDetail}
            onRetrySourceInvoice={retryDetailSourceInvoice}
            onEditDetails={(accrual) =>
              beginEditDraftDetails(accrual, { preserveDetail: true })
            }
            onEditAmount={(accrual) => beginEditAmount(accrual, { preserveDetail: true })}
            onEditSourceInvoice={(accrual) =>
              beginChangeSourceInvoice(accrual, { preserveDetail: true })
            }
            onRecognize={(accrual) =>
              void handleRecognizeAccrual(accrual, { preserveDetail: true })
            }
            onReverse={(accrual) => beginReverse(accrual, { preserveDetail: true })}
            onOpenInvoice={onOpenInvoice}
          />
        ) : null}
        {workspace ? (
          <ListLoadState
            loading={loading}
            loadingMessage={t("accruals.listLoading")}
            error={error}
            onRetry={() => void loadPage(workspace.id, page, appliedFilters)}
            retryDisabled={loading}
            empty={accruals.length === 0}
            emptyMessage={
              filtersActive ? t("accruals.listEmptyFiltered") : t("accruals.listEmpty")
            }
          />
        ) : null}

        {accruals.length > 0 ? (
          <>
            <p className="meta">
              {t("accruals.pageMeta", {
                page,
                shown: accruals.length,
                total: totalCount
              })}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("accruals.col.type")}</th>
                    <th>{t("accruals.col.status")}</th>
                    <th>{t("accruals.col.description")}</th>
                    <th>{t("accruals.col.amount")}</th>
                    <th>{t("accruals.col.invoice")}</th>
                    <th>{t("accruals.col.recognitionDate")}</th>
                    <th>{t("accruals.col.recognizedAt")}</th>
                    <th>{t("accruals.col.reversedAt")}</th>
                    <th>{t("accruals.col.reversalReason")}</th>
                    <th>{t("accruals.col.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {accruals.map((accrual) => {
                    const recognizeBusy = recognizingIds.has(accrual.id);
                    const reverseBusy = reversingIds.has(accrual.id);
                    const editAmountBusy = editingAmountIds.has(accrual.id);
                    const sourceInvoiceBusy = changingSourceInvoiceIds.has(accrual.id);
                    const draftDetailsBusy = editingDraftDetailsIds.has(accrual.id);
                    const rowBusy =
                      recognizeBusy ||
                      reverseBusy ||
                      editAmountBusy ||
                      sourceInvoiceBusy ||
                      draftDetailsBusy;
                    const showEditAmount = canEditAccrualAmount(accrual);
                    const showEditDraftDetails = canEditDraftAccrualDetails(accrual);
                    const showSourceInvoice = canChangeAccrualSourceInvoice(accrual);
                    const showRecognize = canRecognizeAccrual(accrual);
                    const showReverse = canReverseAccrual(accrual);
                    const showDetails = canViewAccrualDetails(accrual);
                    const sourceInvoiceLabel = formatAccrualSourceInvoiceListCell(
                      accrual.sourceInvoiceId,
                      accrual.sourceInvoiceId
                        ? invoiceDisplayCache.get(accrual.sourceInvoiceId)
                        : null
                    );
                    return (
                    <tr
                      key={accrual.id}
                      data-row-id={accrual.id}
                      className={accrual.id === highlightedId ? "row-highlight" : undefined}
                    >
                      <td>{typeLabel(accrual.type)}</td>
                      <td>{statusLabel(accrual.status)}</td>
                      <td className="cell-wrap">{accrual.description}</td>
                      <td>{formatMoney(accrual.amount, accrual.currency)}</td>
                      <td className="cell-wrap">{sourceInvoiceLabel}</td>
                      <td>{formatDate(accrual.recognitionDateUtc)}</td>
                      <td>{formatDate(accrual.recognizedAtUtc)}</td>
                      <td>
                        {accrual.status === "Reversed" || accrual.reversedAtUtc
                          ? formatDate(accrual.reversedAtUtc)
                          : "—"}
                      </td>
                      <td className="cell-wrap">{accrual.reversalReason ?? "—"}</td>
                      <td>
                        {showDetails ||
                        showEditDraftDetails ||
                        showEditAmount ||
                        showSourceInvoice ||
                        showRecognize ||
                        showReverse ? (
                          <div className="filter-actions">
                            {showDetails ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={loading || detailLoading}
                                onClick={() => beginViewAccrualDetails(accrual)}
                              >
                                {detailLoading && detailTargetId === accrual.id
                                  ? t("loading", { ns: "common" })
                                  : t("details", { ns: "common" })}
                              </button>
                            ) : null}
                            {showEditDraftDetails ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={
                                  rowBusy ||
                                  loading ||
                                  draftDetailsTarget?.id === accrual.id
                                }
                                onClick={() => beginEditDraftDetails(accrual)}
                              >
                                {draftDetailsBusy
                                  ? t("saving", { ns: "common" })
                                  : t("accruals.editAction")}
                              </button>
                            ) : null}
                            {showEditAmount ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={
                                  rowBusy ||
                                  loading ||
                                  editAmountTarget?.id === accrual.id
                                }
                                onClick={() => beginEditAmount(accrual)}
                              >
                                {editAmountBusy
                                  ? t("saving", { ns: "common" })
                                  : t("accruals.editAmountAction")}
                              </button>
                            ) : null}
                            {showSourceInvoice ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={
                                  rowBusy ||
                                  loading ||
                                  sourceInvoiceTarget?.id === accrual.id
                                }
                                onClick={() => beginChangeSourceInvoice(accrual)}
                              >
                                {sourceInvoiceBusy
                                  ? t("saving", { ns: "common" })
                                  : t("accruals.editSourceInvoiceAction")}
                              </button>
                            ) : null}
                            {showRecognize ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={rowBusy || loading}
                                onClick={() => void handleRecognizeAccrual(accrual)}
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
                                disabled={
                                  rowBusy || loading || reverseTarget?.id === accrual.id
                                }
                                onClick={() => beginReverse(accrual)}
                              >
                                {reverseBusy
                                  ? t("accruals.reversingAction")
                                  : t("accruals.reverseAction")}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="meta">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              className="pagination"
              role="navigation"
              aria-label={t("accruals.paginationAria")}
            >
              <button
                type="button"
                disabled={!canGoPrevious}
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  onDiscoveryChange?.(nextPage, appliedFilters);
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
                  onDiscoveryChange?.(nextPage, appliedFilters);
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
