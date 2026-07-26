import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getInvoice, listInvoicesPaged, type Invoice } from "./api";
import {
  SOURCE_INVOICE_PICKER_PAGE_SIZE,
  buildSourceInvoicePickerQuery,
  formatSourceInvoiceSelection,
  hasSourceInvoiceSelectionChanged,
  normalizePickerDocumentNumber,
  toInvoicePickerSummary,
  type InvoicePickerSummary
} from "./accrualSourceInvoice";
import { totalPages } from "./invoiceListQuery";
import { ListLoadState } from "./components/ListLoadState";
import { StatusMessage } from "./components/Panel";
import { formatMoney } from "./format";

type SourceInvoicePickerProps = {
  workspaceId: string;
  accrualDescription: string;
  baselineInvoiceId: string | null;
  busy: boolean;
  formError: string | null;
  onSave: (sourceInvoiceId: string | null, selected: InvoicePickerSummary | null) => void;
  onCancel: () => void;
};

export function SourceInvoicePicker({
  workspaceId,
  accrualDescription,
  baselineInvoiceId,
  busy,
  formError,
  onSave,
  onCancel
}: SourceInvoicePickerProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(baselineInvoiceId);
  const [selectedDisplay, setSelectedDisplay] = useState<InvoicePickerSummary | null>(null);
  const [currentLookupPending, setCurrentLookupPending] = useState(Boolean(baselineInvoiceId));
  const [currentLookupError, setCurrentLookupError] = useState<string | null>(null);

  const [documentNumberDraft, setDocumentNumberDraft] = useState("");
  const [appliedDocumentNumber, setAppliedDocumentNumber] = useState("");
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(SOURCE_INVOICE_PICKER_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadPickerPage = useCallback(
    async (nextPage: number, documentNumber: string) => {
      const { query, validationError } = buildSourceInvoicePickerQuery(nextPage, documentNumber);
      if (validationError) {
        setFilterValidationError(validationError);
        setLoading(false);
        return;
      }

      setFilterValidationError(null);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeq.current;
      setLoading(true);
      setListError(null);

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
        setListError(
          loadError instanceof Error ? loadError.message : "Не вдалося завантажити рахунки."
        );
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    const controller = new AbortController();

    if (!baselineInvoiceId) {
      setSelectedInvoiceId(null);
      setSelectedDisplay(null);
      setCurrentLookupPending(false);
      setCurrentLookupError(null);
      return () => {
        controller.abort();
      };
    }

    setSelectedInvoiceId(baselineInvoiceId);
    setSelectedDisplay(null);
    setCurrentLookupPending(true);
    setCurrentLookupError(null);

    void getInvoice(workspaceId, baselineInvoiceId, controller.signal)
      .then((invoice) => {
        if (controller.signal.aborted) {
          return;
        }

        setSelectedDisplay(toInvoicePickerSummary(invoice));
        setCurrentLookupPending(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setSelectedDisplay(null);
        setCurrentLookupPending(false);
        setCurrentLookupError(
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити поточний рахунок-джерело."
        );
      });

    return () => {
      controller.abort();
    };
  }, [workspaceId, baselineInvoiceId]);

  useEffect(() => {
    void loadPickerPage(page, appliedDocumentNumber);

    return () => {
      abortRef.current?.abort();
    };
  }, [page, appliedDocumentNumber, loadPickerPage]);

  function applyDocumentNumberFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePickerDocumentNumber(documentNumberDraft);
    const { validationError } = buildSourceInvoicePickerQuery(1, normalized);
    if (validationError) {
      setFilterValidationError(validationError);
      return;
    }

    setFilterValidationError(null);
    setPage(1);
    setAppliedDocumentNumber(normalized);
  }

  function clearDocumentNumberFilter() {
    setDocumentNumberDraft("");
    setAppliedDocumentNumber("");
    setFilterValidationError(null);
    setPage(1);
  }

  function selectInvoice(invoice: Invoice) {
    setSelectedInvoiceId(invoice.id);
    setSelectedDisplay(toInvoicePickerSummary(invoice));
    setCurrentLookupError(null);
  }

  function clearSelection() {
    setSelectedInvoiceId(null);
    setSelectedDisplay(null);
    setCurrentLookupError(null);
  }

  function handleSave() {
    if (busy || currentLookupPending) {
      return;
    }

    if (!hasSourceInvoiceSelectionChanged(baselineInvoiceId, selectedInvoiceId)) {
      return;
    }

    onSave(selectedInvoiceId, selectedDisplay);
  }

  const pages = totalPages(totalCount, pageSize);
  const canGoPrevious = page > 1 && !loading && !busy;
  const canGoNext = page < pages && !loading && !busy;
  const dirty = hasSourceInvoiceSelectionChanged(baselineInvoiceId, selectedInvoiceId);
  const selectionLabel = currentLookupPending
    ? "Завантаження поточного рахунку…"
    : formatSourceInvoiceSelection(selectedDisplay);

  return (
    <div className="create-form issue-prepare-form">
      <p className="meta">
        Рахунок-джерело: <span className="cell-wrap">{accrualDescription}</span>
      </p>
      <p className="meta">
        Поточний вибір: <span className="cell-wrap">{selectionLabel}</span>
      </p>
      {currentLookupError ? (
        <StatusMessage tone="error">
          Поточний звʼязок недоступний для відображення. Можна очистити або вибрати інший рахунок.
        </StatusMessage>
      ) : null}

      <form className="filter-form" onSubmit={applyDocumentNumberFilter}>
        <label>
          Номер документа
          <input
            value={documentNumberDraft}
            onChange={(event) => setDocumentNumberDraft(event.target.value)}
            placeholder="Точний номер (не частковий пошук)"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <div className="filter-actions">
          <button type="submit" disabled={busy || loading}>
            Знайти
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={busy || loading}
            onClick={clearDocumentNumberFilter}
          >
            Скинути фільтр
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={busy || selectedInvoiceId === null}
            onClick={clearSelection}
          >
            Очистити вибір
          </button>
        </div>
      </form>

      {filterValidationError ? (
        <StatusMessage tone="error">{filterValidationError}</StatusMessage>
      ) : null}
      <p className="meta">
        Рахунки поточного workspace · сторінка {SOURCE_INVOICE_PICKER_PAGE_SIZE} записів · статус не
        обмежується клієнтом.
      </p>

      <ListLoadState
        loading={loading}
        loadingMessage="Завантаження рахунків…"
        error={listError}
        onRetry={() => void loadPickerPage(page, appliedDocumentNumber)}
        retryDisabled={loading || busy}
        empty={!loading && !listError && invoices.length === 0}
        emptyMessage={
          appliedDocumentNumber
            ? "За точним номером документа рахунків немає."
            : "У цьому workspace ще немає рахунків."
        }
      />

      {invoices.length > 0 ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Статус</th>
                  <th>Контрагент</th>
                  <th>Сума</th>
                  <th>Вибір</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const selected = selectedInvoiceId === invoice.id;
                  return (
                    <tr key={invoice.id} className={selected ? "row-highlight" : undefined}>
                      <td className="mono">{invoice.documentNumber}</td>
                      <td>{invoice.status}</td>
                      <td className="cell-wrap">{invoice.counterpartyReference}</td>
                      <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={busy || loading}
                          onClick={() => selectInvoice(invoice)}
                        >
                          {selected ? "Вибрано" : "Вибрати"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pagination" role="navigation" aria-label="Сторінки рахунків-джерел">
            <button
              type="button"
              disabled={!canGoPrevious}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Назад
            </button>
            <span className="meta">
              {page} / {pages} · усього {totalCount}
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

      {formError ? <StatusMessage tone="error">{formError}</StatusMessage> : null}

      <div className="filter-actions">
        <button
          type="button"
          disabled={busy || !dirty || currentLookupPending}
          onClick={handleSave}
        >
          {busy ? "Збереження…" : "Зберегти"}
        </button>
        <button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>
          Скасувати
        </button>
      </div>
    </div>
  );
}
