import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  changeAccrualAmount,
  createAccrual,
  listAccrualsPaged,
  recognizeAccrual,
  reverseAccrual,
  type Accrual,
  type FinanceWorkspace
} from "./api";
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
import { canRecognizeAccrual } from "./accrualRecognize";
import {
  REVERSAL_REASON_MAX_LENGTH,
  canReverseAccrual,
  normalizeReversalReason
} from "./accrualReverse";
import { EMPTY_ACCRUAL_FILTERS } from "./urlState";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import { formatDate, formatMoney } from "./format";

type AccrualsViewProps = {
  workspace: FinanceWorkspace | null;
  initialPage?: number;
  initialFilters?: AccrualListFilters;
  onDiscoveryChange?: (page: number, filters: AccrualListFilters) => void;
};

const emptyFilters: AccrualListFilters = { ...EMPTY_ACCRUAL_FILTERS };

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AccrualsView({
  workspace,
  initialPage = 1,
  initialFilters = emptyFilters,
  onDiscoveryChange
}: AccrualsViewProps) {
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
  const [accrualDescription, setAccrualDescription] = useState("Демонстраційне нарахування");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
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

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const recognizingIdsRef = useRef<Set<string>>(new Set());
  const reversingIdsRef = useRef<Set<string>>(new Set());
  const editingAmountIdsRef = useRef<Set<string>>(new Set());

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
      onDiscoveryChange?.(1, emptyFilters);
    }
  }, [workspace?.id, onDiscoveryChange]);

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
          loadError instanceof Error ? loadError.message : "Не вдалося завантажити нарахування."
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
      setCreateError("Сума має бути числовим значенням.");
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

    try {
      const created = await createAccrual(workspace.id, {
        type: accrualType,
        amount,
        currency: accrualCurrency,
        recognitionDateUtc: new Date(`${accrualRecognitionDate}T00:00:00.000Z`).toISOString(),
        description: accrualDescription
      });
      setDraftFilters(emptyFilters);
      setAppliedFilters(emptyFilters);
      setFilterValidationError(null);
      setPage(1);
      setHighlightedId(created.id);
      setCreateSuccess(
        `Чернетку нарахування «${created.description}» створено. Запис показано у списку нижче.`
      );
      onDiscoveryChange?.(1, emptyFilters);
      await loadPage(workspace.id, 1, emptyFilters);
    } catch (createErr) {
      setCreateError(
        createErr instanceof Error ? createErr.message : "Не вдалося створити нарахування."
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRecognizeAccrual(accrual: Accrual) {
    if (!workspace || !canRecognizeAccrual(accrual)) {
      return;
    }

    if (recognizingIdsRef.current.has(accrual.id)) {
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

    try {
      const recognized = await recognizeAccrual(workspace.id, accrual.id);
      setHighlightedId(recognized.id);
      setRecognizeSuccess(
        `Нарахування «${recognized.description}» визнано. Статус: ${recognized.status}.`
      );
      await loadPage(workspace.id, page, appliedFilters);
    } catch (recognizeErr) {
      setRecognizeError(
        recognizeErr instanceof Error
          ? recognizeErr.message
          : "Не вдалося визнати нарахування."
      );
      try {
        await loadPage(workspace.id, page, appliedFilters);
      } catch {
        // Keep the recognize error; list refresh failure is secondary.
      }
    } finally {
      recognizingIdsRef.current.delete(accrual.id);
      setRecognizingIds(new Set(recognizingIdsRef.current));
    }
  }

  function beginReverse(accrual: Accrual) {
    if (!canReverseAccrual(accrual) || reversingIdsRef.current.has(accrual.id)) {
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

  function beginEditAmount(accrual: Accrual) {
    if (!canEditAccrualAmount(accrual) || editingAmountIdsRef.current.has(accrual.id)) {
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
          : "Перевірте суму нарахування."
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

    try {
      const updated = await changeAccrualAmount(workspace.id, target.id, amount);
      setEditAmountTarget(null);
      setEditAmountValue("");
      setHighlightedId(updated.id);
      setEditAmountSuccess(
        `Суму нарахування «${updated.description}» змінено на ${formatMoney(updated.amount, updated.currency)}.`
      );
      await loadPage(workspace.id, page, appliedFilters);
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
          : "Перевірте причину сторнування."
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

    try {
      const reversed = await reverseAccrual(workspace.id, target.id, reason);
      setReverseTarget(null);
      setReverseReason("");
      setHighlightedId(reversed.id);
      setReverseSuccess(
        `Нарахування «${reversed.description}» сторновано. Статус: ${reversed.status}.`
      );
      await loadPage(workspace.id, page, appliedFilters);
    } catch (reverseErr) {
      setReverseError(
        reverseErr instanceof Error
          ? reverseErr.message
          : "Не вдалося сторнувати нарахування."
      );
      setReverseTarget(null);
      setReverseReason("");
      try {
        await loadPage(workspace.id, page, appliedFilters);
      } catch {
        // Keep the reverse error; list refresh failure is secondary.
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

  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Accruals</h1>
        <p className="lede">
          Нарахування обраного фінансового простору з реального Finance API: фільтри та
          посторінковий перегляд.
        </p>
      </header>

      <Panel
        title="Нарахування"
        headingId="accruals-heading"
        actions={
          <button
            type="button"
            onClick={() => workspace && void loadPage(workspace.id, page, appliedFilters)}
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

            <form className="filter-form" onSubmit={applyFilters}>
              <label>
                Префікс опису
                <input
                  value={draftFilters.descriptionPrefix ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      descriptionPrefix: event.target.value
                    }))
                  }
                  placeholder="наприклад: Demo"
                  autoComplete="off"
                />
              </label>
              <label>
                Статус
                <select
                  value={draftFilters.status ?? ""}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      status: event.target.value as AccrualStatusFilter
                    }))
                  }
                >
                  <option value="">Усі</option>
                  {ACCRUAL_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Дата визнання з
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
                Дата визнання по
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
                  Застосувати
                </button>
                <button type="button" onClick={clearFilters} disabled={loading}>
                  Скинути
                </button>
              </div>
            </form>

            {filterValidationError ? (
              <StatusMessage tone="error">{filterValidationError}</StatusMessage>
            ) : null}
            {filtersActive ? (
              <p className="meta">
                Активні фільтри:
                {appliedFilters.descriptionPrefix?.trim()
                  ? ` опис «${appliedFilters.descriptionPrefix.trim()}»`
                  : ""}
                {appliedFilters.status === "Draft" ||
                appliedFilters.status === "Recognized" ||
                appliedFilters.status === "Reversed"
                  ? ` статус ${appliedFilters.status}`
                  : ""}
                {appliedFilters.recognitionFromDate
                  ? ` з ${appliedFilters.recognitionFromDate}`
                  : ""}
                {appliedFilters.recognitionToDate
                  ? ` по ${appliedFilters.recognitionToDate}`
                  : ""}
              </p>
            ) : (
              <p className="meta">Фільтри не застосовані.</p>
            )}

            <form className="create-form create-form-accrual" onSubmit={(event) => void handleCreateAccrual(event)}>
              <label>
                Тип
                <select value={accrualType} onChange={(event) => setAccrualType(event.target.value)}>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </select>
              </label>
              <label>
                Сума
                <input
                  value={accrualAmount}
                  onChange={(event) => setAccrualAmount(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Валюта
                <input
                  value={accrualCurrency}
                  onChange={(event) => setAccrualCurrency(event.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </label>
              <label>
                Дата визнання
                <input
                  type="date"
                  value={accrualRecognitionDate}
                  onChange={(event) => setAccrualRecognitionDate(event.target.value)}
                  required
                />
              </label>
              <label>
                Опис
                <input
                  value={accrualDescription}
                  onChange={(event) => setAccrualDescription(event.target.value)}
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
        {recognizeError ? <StatusMessage tone="error">{recognizeError}</StatusMessage> : null}
        {recognizeSuccess ? (
          <StatusMessage tone="success">{recognizeSuccess}</StatusMessage>
        ) : null}
        {editAmountError ? <StatusMessage tone="error">{editAmountError}</StatusMessage> : null}
        {editAmountSuccess ? (
          <StatusMessage tone="success">{editAmountSuccess}</StatusMessage>
        ) : null}
        {reverseError ? <StatusMessage tone="error">{reverseError}</StatusMessage> : null}
        {reverseSuccess ? <StatusMessage tone="success">{reverseSuccess}</StatusMessage> : null}

        {workspace && editAmountTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleEditAmount(event)}
          >
            <p className="meta">
              Редагування суми:{" "}
              <span className="cell-wrap">{editAmountTarget.description}</span>
              {" · "}
              {editAmountTarget.currency}
            </p>
            <label>
              Сума
              <input
                value={editAmountValue}
                onChange={(event) => setEditAmountValue(event.target.value)}
                inputMode="decimal"
                required
                disabled={editingAmountIds.has(editAmountTarget.id)}
                aria-label="Нова сума нарахування"
              />
            </label>
            <div className="filter-actions">
              <button
                type="submit"
                disabled={editingAmountIds.has(editAmountTarget.id) || loading}
              >
                {editingAmountIds.has(editAmountTarget.id) ? "Збереження…" : "Зберегти"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={editingAmountIds.has(editAmountTarget.id)}
                onClick={cancelEditAmount}
              >
                Скасувати
              </button>
            </div>
          </form>
        ) : null}

        {workspace && reverseTarget ? (
          <form
            className="create-form issue-prepare-form"
            onSubmit={(event) => void handleReverseAccrual(event)}
          >
            <p className="meta">
              Сторнування: <span className="cell-wrap">{reverseTarget.description}</span>
            </p>
            <label>
              Причина сторнування
              <input
                value={reverseReason}
                onChange={(event) => setReverseReason(event.target.value)}
                maxLength={REVERSAL_REASON_MAX_LENGTH}
                required
                disabled={reversingIds.has(reverseTarget.id)}
                placeholder="Обов’язкова причина"
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={reversingIds.has(reverseTarget.id) || loading}>
                {reversingIds.has(reverseTarget.id) ? "Сторнування…" : "Сторнувати"}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={reversingIds.has(reverseTarget.id)}
                onClick={cancelReverse}
              >
                Скасувати
              </button>
            </div>
          </form>
        ) : null}
        {workspace ? (
          <ListLoadState
            loading={loading}
            loadingMessage="Завантаження нарахувань…"
            error={error}
            onRetry={() => void loadPage(workspace.id, page, appliedFilters)}
            retryDisabled={loading}
            empty={accruals.length === 0}
            emptyMessage={
              filtersActive
                ? "За поточними фільтрами нарахувань немає."
                : "Нарахувань ще немає. Створіть чернетку або натисніть Оновити."
            }
          />
        ) : null}

        {accruals.length > 0 ? (
          <>
            <p className="meta">
              Сторінка {page} · показано {accruals.length} · усього {totalCount}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Опис</th>
                    <th>Сума</th>
                    <th>Дата визнання</th>
                    <th>Визнано</th>
                    <th>Сторновано</th>
                    <th>Причина сторно</th>
                    <th>Дія</th>
                  </tr>
                </thead>
                <tbody>
                  {accruals.map((accrual) => {
                    const recognizeBusy = recognizingIds.has(accrual.id);
                    const reverseBusy = reversingIds.has(accrual.id);
                    const editAmountBusy = editingAmountIds.has(accrual.id);
                    const rowBusy = recognizeBusy || reverseBusy || editAmountBusy;
                    const showEditAmount = canEditAccrualAmount(accrual);
                    const showRecognize = canRecognizeAccrual(accrual);
                    const showReverse = canReverseAccrual(accrual);
                    return (
                    <tr
                      key={accrual.id}
                      data-row-id={accrual.id}
                      className={accrual.id === highlightedId ? "row-highlight" : undefined}
                    >
                      <td>{accrual.type}</td>
                      <td>{accrual.status}</td>
                      <td className="cell-wrap">{accrual.description}</td>
                      <td>{formatMoney(accrual.amount, accrual.currency)}</td>
                      <td>{formatDate(accrual.recognitionDateUtc)}</td>
                      <td>{formatDate(accrual.recognizedAtUtc)}</td>
                      <td>
                        {accrual.status === "Reversed" || accrual.reversedAtUtc
                          ? formatDate(accrual.reversedAtUtc)
                          : "—"}
                      </td>
                      <td className="cell-wrap">{accrual.reversalReason ?? "—"}</td>
                      <td>
                        {showEditAmount || showRecognize || showReverse ? (
                          <div className="filter-actions">
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
                                {editAmountBusy ? "Збереження…" : "Змінити суму"}
                              </button>
                            ) : null}
                            {showRecognize ? (
                              <button
                                type="button"
                                className="button-secondary"
                                disabled={rowBusy || loading}
                                onClick={() => void handleRecognizeAccrual(accrual)}
                              >
                                {recognizeBusy ? "Визнання…" : "Визнати"}
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
                                {reverseBusy ? "Сторнування…" : "Сторнувати"}
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
            <div className="pagination" role="navigation" aria-label="Сторінки нарахувань">
              <button
                type="button"
                disabled={!canGoPrevious}
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  onDiscoveryChange?.(nextPage, appliedFilters);
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
                  onDiscoveryChange?.(nextPage, appliedFilters);
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
