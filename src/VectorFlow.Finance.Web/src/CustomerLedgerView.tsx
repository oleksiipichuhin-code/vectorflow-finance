import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAccrual,
  FinanceApiRequestError,
  getInvoice,
  listAccrualsByInvoice,
  listInvoicesPaged,
  type Accrual,
  type FinanceWorkspace,
  type Invoice
} from "./api";
import {
  AGING_BUCKET_OPTIONS,
  type AgingBucketFilter
} from "./invoiceCollections";
import {
  applyCreateAccrualFromInvoice,
  canCreateAccrualFromInvoice,
  initialCreateAccrualFromInvoiceValues,
  interpretCreateAccrualFromInvoiceError,
  validateCreateAccrualFromInvoiceValues,
  type CreateAccrualFromInvoiceValues
} from "./invoiceAccrualBridge";
import { CreateAccrualFromInvoiceEditor } from "./components/CreateAccrualFromInvoiceEditor";
import { classifyDueDateAging } from "./invoiceDueDateAging";
import { formatDate, formatMoney } from "./format";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import {
  buildCustomerLedgerSummaries,
  CUSTOMER_LEDGER_PAGE_SIZE,
  customerLedgerCurrencyLabel,
  customerLedgerOpenItems,
  EMPTY_CUSTOMER_LEDGER_FILTERS,
  filterCustomerLedgerSummaries,
  findCustomerLedgerSummary,
  formatCustomerLedgerAgingBadge,
  normalizeCounterpartyReference,
  type CustomerLedgerListFilters
} from "./customerLedger";

type SelectionChangeOptions = {
  replace?: boolean;
};

type CustomerLedgerViewProps = {
  workspace: FinanceWorkspace | null;
  selectedCounterpartyReference?: string;
  selectedInvoiceId?: string | null;
  initialQuery?: string;
  initialAgingBucket?: AgingBucketFilter;
  onFilterChange?: (query: string, agingBucket: AgingBucketFilter) => void;
  onSelectedCounterpartyChange?: (
    counterpartyReference: string | null,
    options?: SelectionChangeOptions
  ) => void;
  onSelectedInvoiceIdChange?: (
    invoiceId: string | null,
    options?: SelectionChangeOptions
  ) => void;
  onOpenInvoice?: (invoiceId: string) => void;
  onOpenAccrual?: (accrualId: string) => void;
  onOpenCollections?: (counterpartyReference: string) => void;
};

export function CustomerLedgerView({
  workspace,
  selectedCounterpartyReference = "",
  selectedInvoiceId = null,
  initialQuery = "",
  initialAgingBucket = "",
  onFilterChange,
  onSelectedCounterpartyChange,
  onSelectedInvoiceIdChange,
  onOpenInvoice,
  onOpenAccrual,
  onOpenCollections
}: CustomerLedgerViewProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [listTotalCount, setListTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [queryDraft, setQueryDraft] = useState(initialQuery);
  const [agingDraft, setAgingDraft] = useState<AgingBucketFilter>(initialAgingBucket);
  const [appliedFilters, setAppliedFilters] = useState<CustomerLedgerListFilters>({
    query: initialQuery,
    agingBucket: initialAgingBucket
  });

  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [linkedAccruals, setLinkedAccruals] = useState<Accrual[]>([]);
  const [linkedAccrualsError, setLinkedAccrualsError] = useState<string | null>(null);

  const [createAccrualBaseline, setCreateAccrualBaseline] =
    useState<CreateAccrualFromInvoiceValues | null>(null);
  const [createAccrualBusy, setCreateAccrualBusy] = useState(false);
  const [createAccrualError, setCreateAccrualError] = useState<string | null>(null);
  const [createAccrualSuccess, setCreateAccrualSuccess] = useState<string | null>(null);
  const createAccrualBusyRef = useRef(false);

  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const accrualsSeq = useRef(0);

  const selectedCounterparty = normalizeCounterpartyReference(
    selectedCounterpartyReference
  );

  const loadIssuedInvoices = useCallback(async (workspaceId: string) => {
    const seq = ++listSeq.current;
    setListLoading(true);
    setListError(null);
    try {
      const page = await listInvoicesPaged(workspaceId, {
        page: 1,
        pageSize: CUSTOMER_LEDGER_PAGE_SIZE,
        status: "Issued"
      });
      if (seq !== listSeq.current) {
        return;
      }
      setInvoices(page.items);
      setListTotalCount(page.totalCount);
    } catch (error) {
      if (seq !== listSeq.current) {
        return;
      }
      setInvoices([]);
      setListTotalCount(0);
      setListError(
        error instanceof Error
          ? error.message
          : "Не вдалося завантажити виставлені рахунки."
      );
    } finally {
      if (seq === listSeq.current) {
        setListLoading(false);
      }
    }
  }, []);

  const loadInvoiceDetail = useCallback(
    async (workspaceId: string, invoiceId: string) => {
      const seq = ++detailSeq.current;
      setDetailLoading(true);
      setDetailError(null);
      try {
        const next = await getInvoice(workspaceId, invoiceId);
        if (seq !== detailSeq.current) {
          return;
        }
        setDetailInvoice(next);
      } catch (error) {
        if (seq !== detailSeq.current) {
          return;
        }
        setDetailInvoice(null);
        if (error instanceof FinanceApiRequestError && error.status === 404) {
          setDetailError("Рахунок не знайдено в цьому workspace.");
          onSelectedInvoiceIdChange?.(null, { replace: true });
          return;
        }
        setDetailError(
          error instanceof Error ? error.message : "Не вдалося завантажити рахунок."
        );
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedInvoiceIdChange]
  );

  const loadLinkedAccruals = useCallback(async (workspaceId: string, invoiceId: string) => {
    const seq = ++accrualsSeq.current;
    setLinkedAccrualsError(null);
    try {
      const items = await listAccrualsByInvoice(workspaceId, invoiceId);
      if (seq !== accrualsSeq.current) {
        return;
      }
      setLinkedAccruals(items);
    } catch (error) {
      if (seq !== accrualsSeq.current) {
        return;
      }
      setLinkedAccruals([]);
      setLinkedAccrualsError(
        error instanceof Error
          ? error.message
          : "Не вдалося завантажити нарахування за рахунком."
      );
    }
  }, []);

  useEffect(() => {
    if (!workspace) {
      setInvoices([]);
      setListTotalCount(0);
      setListError(null);
      setListLoading(false);
      return;
    }
    void loadIssuedInvoices(workspace.id);
    return () => {
      listSeq.current += 1;
    };
  }, [workspace, loadIssuedInvoices]);

  useEffect(() => {
    if (!workspace || !selectedInvoiceId) {
      setDetailInvoice(null);
      setDetailError(null);
      setDetailLoading(false);
      setLinkedAccruals([]);
      setLinkedAccrualsError(null);
      setCreateAccrualBaseline(null);
      return;
    }
    void loadInvoiceDetail(workspace.id, selectedInvoiceId);
    void loadLinkedAccruals(workspace.id, selectedInvoiceId);
    return () => {
      detailSeq.current += 1;
      accrualsSeq.current += 1;
    };
  }, [workspace, selectedInvoiceId, loadInvoiceDetail, loadLinkedAccruals]);

  const summaries = useMemo(
    () => buildCustomerLedgerSummaries(invoices),
    [invoices]
  );

  const visibleSummaries = useMemo(
    () => filterCustomerLedgerSummaries(summaries, invoices, appliedFilters),
    [summaries, invoices, appliedFilters]
  );

  const selectedSummary = useMemo(
    () => findCustomerLedgerSummary(summaries, selectedCounterparty),
    [summaries, selectedCounterparty]
  );

  const openItems = useMemo(
    () =>
      selectedCounterparty
        ? customerLedgerOpenItems(
            invoices,
            selectedCounterparty,
            appliedFilters.agingBucket
          )
        : [],
    [invoices, selectedCounterparty, appliedFilters.agingBucket]
  );

  useEffect(() => {
    if (!selectedCounterparty || listLoading || listError) {
      return;
    }
    if (summaries.length === 0) {
      return;
    }
    if (!selectedSummary) {
      onSelectedCounterpartyChange?.(null, { replace: true });
      onSelectedInvoiceIdChange?.(null, { replace: true });
    }
  }, [
    selectedCounterparty,
    selectedSummary,
    summaries.length,
    listLoading,
    listError,
    onSelectedCounterpartyChange,
    onSelectedInvoiceIdChange
  ]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: CustomerLedgerListFilters = {
      query: queryDraft.trim(),
      agingBucket: agingDraft
    };
    setAppliedFilters(next);
    onFilterChange?.(next.query, next.agingBucket);
  }

  function clearFilters() {
    setQueryDraft("");
    setAgingDraft("");
    setAppliedFilters({ ...EMPTY_CUSTOMER_LEDGER_FILTERS });
    onFilterChange?.("", "");
  }

  function openCustomer(counterpartyReference: string) {
    const key = normalizeCounterpartyReference(counterpartyReference);
    if (!key) {
      return;
    }
    setCreateAccrualSuccess(null);
    setCreateAccrualError(null);
    setCreateAccrualBaseline(null);
    onSelectedInvoiceIdChange?.(null);
    onSelectedCounterpartyChange?.(key);
  }

  function closeCustomer() {
    setCreateAccrualBaseline(null);
    setCreateAccrualError(null);
    setCreateAccrualSuccess(null);
    onSelectedInvoiceIdChange?.(null);
    onSelectedCounterpartyChange?.(null);
  }

  function openInvoiceRow(invoiceId: string) {
    setCreateAccrualBaseline(null);
    setCreateAccrualError(null);
    setCreateAccrualSuccess(null);
    onSelectedInvoiceIdChange?.(invoiceId);
  }

  function startCreateAccrual(invoice: Invoice) {
    if (!canCreateAccrualFromInvoice(invoice) || createAccrualBusyRef.current) {
      return;
    }
    setCreateAccrualError(null);
    setCreateAccrualSuccess(null);
    setCreateAccrualBaseline(initialCreateAccrualFromInvoiceValues(invoice));
  }

  async function handleSaveCreateAccrual(values: CreateAccrualFromInvoiceValues) {
    if (
      !workspace ||
      !detailInvoice ||
      !createAccrualBaseline ||
      !canCreateAccrualFromInvoice(detailInvoice) ||
      createAccrualBusyRef.current
    ) {
      return;
    }

    const validationError = validateCreateAccrualFromInvoiceValues(values);
    if (validationError) {
      setCreateAccrualError(validationError);
      return;
    }

    createAccrualBusyRef.current = true;
    setCreateAccrualBusy(true);
    setCreateAccrualError(null);

    try {
      const created = await applyCreateAccrualFromInvoice(
        workspace.id,
        detailInvoice,
        values,
        { createAccrual }
      );
      setCreateAccrualBaseline(null);
      setCreateAccrualSuccess(
        `Створено нарахування ${created.id.slice(0, 8)}… зі статусом ${created.status}.`
      );
      await loadLinkedAccruals(workspace.id, detailInvoice.id);
    } catch (createErr) {
      const failure = interpretCreateAccrualFromInvoiceError(createErr);
      setCreateAccrualError(failure.message);
      if (!failure.keepFormOpen) {
        setCreateAccrualBaseline(null);
      }
      if (failure.refreshInvoice) {
        await loadInvoiceDetail(workspace.id, detailInvoice.id);
      }
    } finally {
      createAccrualBusyRef.current = false;
      setCreateAccrualBusy(false);
    }
  }

  if (!workspace) {
    return (
      <Panel title="Customer ledger" headingId="customer-ledger-heading">
        <StatusMessage>Спочатку відкрийте finance workspace.</StatusMessage>
      </Panel>
    );
  }

  const truncated = listTotalCount > invoices.length;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">Accounts receivable</p>
        <h1>Customer ledger</h1>
        <p className="lede">
          Відкриті Issued рахунки за контрагентом → aging → деталі → нарахування. Стан у
          shareable URL. Оплата ще не моделюється в API.
        </p>
      </header>

      <Panel
        title="Контрагенти"
        headingId="customer-ledger-list-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadIssuedInvoices(workspace.id)}
          >
            {listLoading ? "Завантаження…" : "Оновити"}
          </button>
        }
      >
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            Пошук контрагента
            <input
              type="text"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              disabled={listLoading}
              placeholder="Частина counterpartyReference"
              aria-label="Пошук контрагента"
            />
          </label>
          <label>
            Aging bucket
            <select
              value={agingDraft}
              onChange={(event) =>
                setAgingDraft(event.target.value as AgingBucketFilter)
              }
              disabled={listLoading}
              aria-label="Aging bucket"
            >
              {AGING_BUCKET_OPTIONS.map((option) => (
                <option key={option.id || "all"} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={listLoading}>
              Застосувати фільтр
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={listLoading}
              onClick={clearFilters}
            >
              Скинути фільтр
            </button>
          </div>
        </form>

        <ListLoadState
          loading={listLoading && invoices.length === 0}
          loadingMessage="Завантаження customer ledger…"
          error={listError}
          onRetry={() => void loadIssuedInvoices(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && summaries.length === 0}
          emptyMessage="Немає Issued рахунків. Виставте рахунок у Invoices."
        />

        {truncated ? (
          <StatusMessage>
            Завантажено {invoices.length} з {listTotalCount} Issued (ліміт{" "}
            {CUSTOMER_LEDGER_PAGE_SIZE}). Підсумок у межах завантаженого набору.
          </StatusMessage>
        ) : null}

        {!listError && summaries.length > 0 && visibleSummaries.length === 0 ? (
          <StatusMessage>Немає контрагентів за обраним фільтром.</StatusMessage>
        ) : null}

        {!listError && visibleSummaries.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Контрагент</th>
                  <th>Рахунки</th>
                  <th>Сума</th>
                  <th>Валюта</th>
                  <th>Aging</th>
                  <th>Прострочено</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleSummaries.map((row) => {
                  const selected = row.counterpartyReference === selectedCounterparty;
                  return (
                    <tr
                      key={row.counterpartyReference}
                      data-row-id={row.counterpartyReference}
                      className={selected ? "row-highlight row-selected" : undefined}
                    >
                      <td className="mono cell-wrap">{row.counterpartyReference}</td>
                      <td>{row.invoiceCount}</td>
                      <td>
                        {formatMoney(
                          row.totalAmount,
                          row.currencies[0] ?? workspace.defaultCurrency
                        )}
                      </td>
                      <td>{customerLedgerCurrencyLabel(row.currencies)}</td>
                      <td>{formatCustomerLedgerAgingBadge(row)}</td>
                      <td>
                        {row.overdueCount}
                        {row.dueTodayCount > 0 ? ` · сьогодні ${row.dueTodayCount}` : ""}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => openCustomer(row.counterpartyReference)}
                        >
                          Відкрити
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {selectedCounterparty && selectedSummary ? (
        <Panel
          title={`Книга: ${selectedCounterparty}`}
          headingId="customer-ledger-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeCustomer}>
              Закрити
            </button>
          }
        >
          <dl className="facts">
            <div>
              <dt>Контрагент</dt>
              <dd className="mono">{selectedSummary.counterpartyReference}</dd>
            </div>
            <div>
              <dt>Відкриті рахунки</dt>
              <dd>{selectedSummary.invoiceCount}</dd>
            </div>
            <div>
              <dt>Сума</dt>
              <dd>
                {formatMoney(
                  selectedSummary.totalAmount,
                  selectedSummary.currencies[0] ?? workspace.defaultCurrency
                )}
              </dd>
            </div>
            <div>
              <dt>Aging</dt>
              <dd>{formatCustomerLedgerAgingBadge(selectedSummary)}</dd>
            </div>
          </dl>

          <div className="filter-actions">
            {onOpenCollections ? (
              <button
                type="button"
                onClick={() => onOpenCollections(selectedCounterparty)}
              >
                Збір оплат
              </button>
            ) : null}
          </div>

          {openItems.length === 0 ? (
            <StatusMessage>Немає відкритих позицій за обраним aging фільтром.</StatusMessage>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Строк</th>
                    <th>Aging</th>
                    <th>Сума</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {openItems.map((row) => {
                    const aging = classifyDueDateAging(row.dueDateUtc);
                    const selected = row.id === selectedInvoiceId;
                    return (
                      <tr
                        key={row.id}
                        data-row-id={row.id}
                        className={selected ? "row-highlight row-selected" : undefined}
                      >
                        <td className="mono cell-wrap">{row.documentNumber}</td>
                        <td>{row.dueDateUtc ? formatDate(row.dueDateUtc) : "—"}</td>
                        <td>
                          {aging.label}
                          {aging.dayOffsetLabel !== "—"
                            ? ` · ${aging.dayOffsetLabel}`
                            : ""}
                        </td>
                        <td>{formatMoney(row.totalAmount, row.currency)}</td>
                        <td>
                          <button
                            type="button"
                            className="button-secondary"
                            onClick={() => openInvoiceRow(row.id)}
                          >
                            Деталі
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Книга контрагента" headingId="customer-ledger-detail-empty-heading">
          <StatusMessage>Оберіть контрагента у списку, щоб відкрити книгу.</StatusMessage>
        </Panel>
      )}

      {selectedInvoiceId ? (
        <Panel
          title="Позиція customer ledger"
          headingId="customer-ledger-invoice-heading"
          actions={
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setCreateAccrualBaseline(null);
                onSelectedInvoiceIdChange?.(null);
              }}
            >
              Закрити
            </button>
          }
        >
          <ListLoadState
            loading={detailLoading && !detailInvoice}
            loadingMessage="Завантаження рахунка…"
            error={detailError}
            onRetry={() => void loadInvoiceDetail(workspace.id, selectedInvoiceId)}
            retryDisabled={detailLoading}
            empty={false}
            emptyMessage=""
          />

          {createAccrualSuccess ? (
            <StatusMessage tone="success">{createAccrualSuccess}</StatusMessage>
          ) : null}
          {createAccrualError && !createAccrualBaseline ? (
            <StatusMessage tone="error">{createAccrualError}</StatusMessage>
          ) : null}

          {detailInvoice ? (
            <>
              <dl className="facts">
                <div>
                  <dt>Документ</dt>
                  <dd className="mono">{detailInvoice.documentNumber}</dd>
                </div>
                <div>
                  <dt>Контрагент</dt>
                  <dd className="mono">{detailInvoice.counterpartyReference}</dd>
                </div>
                <div>
                  <dt>Статус</dt>
                  <dd>{detailInvoice.status}</dd>
                </div>
                <div>
                  <dt>Строк оплати</dt>
                  <dd>
                    {detailInvoice.dueDateUtc
                      ? formatDate(detailInvoice.dueDateUtc)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Сума</dt>
                  <dd>
                    {formatMoney(detailInvoice.totalAmount, detailInvoice.currency)}
                  </dd>
                </div>
                <div>
                  <dt>Aging</dt>
                  <dd>{classifyDueDateAging(detailInvoice.dueDateUtc).label}</dd>
                </div>
              </dl>

              <p className="meta">
                {classifyDueDateAging(detailInvoice.dueDateUtc).explanation}
              </p>

              <div className="filter-actions">
                {onOpenInvoice ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onOpenInvoice(detailInvoice.id)}
                  >
                    Відкрити в Invoices
                  </button>
                ) : null}
                {canCreateAccrualFromInvoice(detailInvoice) ? (
                  <button
                    type="button"
                    disabled={createAccrualBusy || Boolean(createAccrualBaseline)}
                    onClick={() => startCreateAccrual(detailInvoice)}
                  >
                    Створити нарахування
                  </button>
                ) : null}
              </div>

              {createAccrualBaseline ? (
                <CreateAccrualFromInvoiceEditor
                  key={`customer-ledger-accrual-${detailInvoice.id}`}
                  documentNumberLabel={detailInvoice.documentNumber}
                  initialValues={createAccrualBaseline}
                  busy={createAccrualBusy}
                  formError={createAccrualError}
                  onSave={(values) => void handleSaveCreateAccrual(values)}
                  onCancel={() => {
                    setCreateAccrualBaseline(null);
                    setCreateAccrualError(null);
                  }}
                />
              ) : null}

              <p className="meta">
                <strong>Нарахування за рахунком</strong>
              </p>
              {linkedAccrualsError ? (
                <StatusMessage tone="error">{linkedAccrualsError}</StatusMessage>
              ) : null}
              {linkedAccruals.length === 0 && !linkedAccrualsError ? (
                <StatusMessage>Пов’язаних нарахувань немає.</StatusMessage>
              ) : null}
              {linkedAccruals.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Accrual</th>
                        <th>Тип</th>
                        <th>Статус</th>
                        <th>Сума</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {linkedAccruals.map((accrual) => (
                        <tr key={accrual.id} data-row-id={accrual.id}>
                          <td className="mono cell-wrap">{accrual.id}</td>
                          <td>{accrual.type}</td>
                          <td>{accrual.status}</td>
                          <td>{formatMoney(accrual.amount, accrual.currency)}</td>
                          <td>
                            {onOpenAccrual ? (
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => onOpenAccrual(accrual.id)}
                              >
                                Accrual
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : null}
    </>
  );
}
