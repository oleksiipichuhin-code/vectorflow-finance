import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  addInvoiceLine,
  createInvoice,
  issueInvoice,
  listInvoicesPaged,
  setInvoiceDueDate,
  type FinanceWorkspace,
  type Invoice
} from "./api";
import {
  EMPTY_INVOICE_FILTERS,
  draftInvoicesDiscovery
} from "./urlState";
import {
  INVOICE_PAGE_SIZE,
  INVOICE_STATUS_OPTIONS,
  buildInvoiceListQuery,
  hasActiveInvoiceFilters,
  totalPages,
  type InvoiceListFilters,
  type InvoiceStatusFilter
} from "./invoiceListQuery";
import {
  defaultDueDateInputValue,
  getInvoiceIssueReadiness,
  isDraftInvoice,
  toDueDateUtcIso
} from "./invoiceIssue";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import { formatDate, formatMoney } from "./format";

type InvoicesViewProps = {
  workspace: FinanceWorkspace | null;
  initialPage?: number;
  initialFilters?: InvoiceListFilters;
  onDiscoveryChange?: (page: number, filters: InvoiceListFilters) => void;
  onShowDraftInvoices?: () => void;
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
  onDiscoveryChange,
  onShowDraftInvoices
}: InvoicesViewProps) {
  const [draftFilters, setDraftFilters] = useState<InvoiceListFilters>(() => ({
    ...emptyFilters,
    ...initialFilters
  }));
  const [appliedFilters, setAppliedFilters] = useState<InvoiceListFilters>(() => ({
    ...emptyFilters,
    ...initialFilters
  }));
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

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const issueBusyRef = useRef(false);

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
      onDiscoveryChange?.(1, emptyFilters);
    }
  }, [workspace?.id, onDiscoveryChange]);

  const loadPage = useCallback(
    async (workspaceId: string, nextPage: number, filters: InvoiceListFilters) => {
      const { query, validationError } = buildInvoiceListQuery(
        nextPage,
        INVOICE_PAGE_SIZE,
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

    void loadPage(workspace.id, page, appliedFilters);

    return () => {
      abortRef.current?.abort();
    };
  }, [workspace, page, appliedFilters, loadPage]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { validationError } = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, draftFilters);
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

    try {
      const created = await createInvoice(workspace.id, {
        documentNumber,
        counterpartyReference,
        currency
      });
      setDocumentNumber(buildDemoDocumentNumber());
      setDraftFilters(emptyFilters);
      setAppliedFilters(emptyFilters);
      setFilterValidationError(null);
      setPage(1);
      setHighlightedId(created.id);
      setIssueTarget(null);
      setCreateSuccess(
        `Чернетку рахунка «${created.documentNumber}» створено. Запис показано у списку нижче.`
      );
      onDiscoveryChange?.(1, emptyFilters);
      await loadPage(workspace.id, 1, emptyFilters);
    } catch (createErr) {
      setCreateError(
        createErr instanceof Error ? createErr.message : "Не вдалося створити рахунок."
      );
    } finally {
      setCreateBusy(false);
    }
  }

  function beginIssue(invoice: Invoice) {
    if (!isDraftInvoice(invoice) || issueBusyRef.current) {
      return;
    }

    setCreateSuccess(null);
    setIssueError(null);
    setIssueSuccess(null);

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
    setIssueBusy(true);
    setIssueError(null);
    setIssueSuccess(null);
    setCreateSuccess(null);

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
      await loadPage(workspace.id, page, appliedFilters);
    } catch (issueErr) {
      setIssueError(
        issueErr instanceof Error ? issueErr.message : "Не вдалося виставити рахунок."
      );
      setIssueTarget(null);
      try {
        await loadPage(workspace.id, page, appliedFilters);
      } catch {
        // Keep the issue error; list refresh failure is secondary.
      }
    } finally {
      issueBusyRef.current = false;
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
  const filtersActive = hasActiveInvoiceFilters(appliedFilters);
  const draftFilterActive =
    appliedFilters.status === "Draft" &&
    !appliedFilters.documentNumber?.trim() &&
    !appliedFilters.createdFromDate?.trim() &&
    !appliedFilters.createdToDate?.trim() &&
    page === 1;

  function applyDraftInvoicesFilter() {
    if (onShowDraftInvoices) {
      onShowDraftInvoices();
      return;
    }

    const next = draftInvoicesDiscovery().invoiceFilters;
    setDraftFilters(next);
    setAppliedFilters(next);
    setFilterValidationError(null);
    setPage(1);
    onDiscoveryChange?.(1, next);
  }

  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Invoices</h1>
        <p className="lede">
          Рахунки обраного фінансового простору з реального Finance API: фільтри та посторінковий
          перегляд.
        </p>
      </header>

      <Panel
        title="Рахунки"
        headingId="invoices-heading"
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
              </div>
              <p className="meta">
                Показує рахунки зі статусом Draft на першій сторінці. Стан зберігається в URL і
                відновлюється після оновлення сторінки.
              </p>
            </div>

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
                {appliedFilters.documentNumber?.trim()
                  ? ` номер «${appliedFilters.documentNumber.trim()}»`
                  : ""}
                {appliedFilters.status === "Draft" || appliedFilters.status === "Issued"
                  ? ` статус ${appliedFilters.status}`
                  : ""}
                {appliedFilters.createdFromDate
                  ? ` з ${appliedFilters.createdFromDate}`
                  : ""}
                {appliedFilters.createdToDate ? ` по ${appliedFilters.createdToDate}` : ""}
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
        {issueError ? <StatusMessage tone="error">{issueError}</StatusMessage> : null}
        {issueSuccess ? <StatusMessage tone="success">{issueSuccess}</StatusMessage> : null}

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

        {workspace ? (
          <ListLoadState
            loading={loading}
            loadingMessage="Завантаження рахунків…"
            error={error}
            onRetry={() => void loadPage(workspace.id, page, appliedFilters)}
            retryDisabled={loading}
            empty={invoices.length === 0}
            emptyMessage={
              filtersActive
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
                    <th>Статус</th>
                    <th>Контрагент</th>
                    <th>Сума</th>
                    <th>Створено</th>
                    <th>Дія</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      data-row-id={invoice.id}
                      className={invoice.id === highlightedId ? "row-highlight" : undefined}
                    >
                      <td className="cell-wrap">{invoice.documentNumber}</td>
                      <td>{invoice.status}</td>
                      <td className="cell-wrap">{invoice.counterpartyReference}</td>
                      <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                      <td>{formatDate(invoice.createdAtUtc)}</td>
                      <td>
                        {isDraftInvoice(invoice) ? (
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={issueBusy || loading}
                            onClick={() => beginIssue(invoice)}
                          >
                            Виставити
                          </button>
                        ) : (
                          <span className="meta">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
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
