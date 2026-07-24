import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  createAccrual,
  listAccrualsPaged,
  type Accrual,
  type FinanceWorkspace
} from "./api";
import {
  ACCRUAL_PAGE_SIZE,
  buildAccrualListQuery,
  hasActiveAccrualFilters,
  totalPages,
  type AccrualListFilters
} from "./accrualListQuery";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import { formatDate, formatMoney } from "./format";

type AccrualsViewProps = {
  workspace: FinanceWorkspace | null;
};

const emptyFilters: AccrualListFilters = {
  descriptionPrefix: "",
  recognitionFromDate: "",
  recognitionToDate: ""
};

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AccrualsView({ workspace }: AccrualsViewProps) {
  const [draftFilters, setDraftFilters] = useState<AccrualListFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<AccrualListFilters>(emptyFilters);
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
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

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (workspace) {
      setAccrualCurrency(workspace.defaultCurrency);
    }
  }, [workspace]);

  useEffect(() => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFilterValidationError(null);
    setPage(1);
    setAccruals([]);
    setTotalCount(0);
    setError(null);
    setCreateError(null);
  }, [workspace?.id]);

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
  }

  function clearFilters() {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setFilterValidationError(null);
    setPage(1);
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

    try {
      await createAccrual(workspace.id, {
        type: accrualType,
        amount,
        currency: accrualCurrency,
        recognitionDateUtc: new Date(`${accrualRecognitionDate}T00:00:00.000Z`).toISOString(),
        description: accrualDescription
      });
      await loadPage(workspace.id, page, appliedFilters);
    } catch (createErr) {
      setCreateError(
        createErr instanceof Error ? createErr.message : "Не вдалося створити нарахування."
      );
    } finally {
      setCreateBusy(false);
    }
  }

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
                  </tr>
                </thead>
                <tbody>
                  {accruals.map((accrual) => (
                    <tr key={accrual.id}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination" role="navigation" aria-label="Сторінки нарахувань">
              <button
                type="button"
                disabled={!canGoPrevious}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Назад
              </button>
              <span className="meta">
                {page} / {pages}
              </span>
              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => setPage((current) => current + 1)}
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
