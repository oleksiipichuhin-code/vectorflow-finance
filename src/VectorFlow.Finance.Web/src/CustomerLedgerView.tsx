import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
  classifyDueDateAging,
  type DueDateAging,
  type DueDateAgingKind
} from "./invoiceDueDateAging";
import { formatDate, formatMoney } from "./i18n/format.ts";
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
  normalizeCounterpartyReference,
  type CustomerLedgerListFilters,
  type CustomerLedgerSummary
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

function agingBucketKey(id: string): string {
  return id ? `customerLedger.agingBucket.${id}` : "customerLedger.agingBucket.all";
}

function localizeAgingBadge(
  summary: Pick<CustomerLedgerSummary, "worstAgingKind" | "maxOverdueDays" | "dueTodayCount">,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (summary.worstAgingKind === "overdue") {
    if (summary.maxOverdueDays == null) {
      return t("customerLedger.agingBadge.overdue");
    }
    if (summary.maxOverdueDays === 1) {
      return t("customerLedger.agingBadge.overdueOneDay");
    }
    return t("customerLedger.agingBadge.overdueDays", { count: summary.maxOverdueDays });
  }

  if (summary.worstAgingKind === "due_today") {
    return t("customerLedger.agingBadge.dueToday");
  }

  if (summary.worstAgingKind === "not_due_yet") {
    return t("customerLedger.agingBadge.notDueYet");
  }

  return t("customerLedger.agingBadge.noDueDate");
}

function localizeAgingPresentation(
  aging: DueDateAging,
  t: (key: string, options?: Record<string, unknown>) => string
): { label: string; dayOffsetLabel: string; explanation: string } {
  const kind = aging.kind as DueDateAgingKind;
  const label = t(`customerLedger.agingKind.${kind}`);
  const explanation = t("customerLedger.agingExplanation");
  const emDash = t("emDash", { ns: "common" });

  if (kind === "no_due_date" || aging.dayOffset == null) {
    return { label, dayOffsetLabel: emDash, explanation };
  }

  if (kind === "due_today") {
    return {
      label,
      dayOffsetLabel: t("customerLedger.dayOffset.dueToday"),
      explanation
    };
  }

  if (kind === "overdue") {
    return {
      label,
      dayOffsetLabel:
        aging.dayOffset === 1
          ? t("customerLedger.dayOffset.overdueOne")
          : t("customerLedger.dayOffset.overdue", { count: aging.dayOffset }),
      explanation
    };
  }

  return {
    label,
    dayOffsetLabel:
      aging.dayOffset === 1
        ? t("customerLedger.dayOffset.untilOne")
        : t("customerLedger.dayOffset.until", { count: aging.dayOffset }),
    explanation
  };
}

function localizeInvoiceStatus(
  status: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const key = `customerLedger.invoiceStatus.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function localizeAccrualStatus(
  status: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const key = `customerLedger.accrualStatus.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function localizeAccrualType(
  type: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const key = `type.${type}`;
  const translated = t(key);
  return translated === key ? type : translated;
}

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
  const { t } = useTranslation(["finance", "common"]);
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
  const [createAccrualSuccessMeta, setCreateAccrualSuccessMeta] = useState<{
    id: string;
    status: string;
  } | null>(null);
  const createAccrualBusyRef = useRef(false);

  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const accrualsSeq = useRef(0);

  const selectedCounterparty = normalizeCounterpartyReference(
    selectedCounterpartyReference
  );

  const loadIssuedInvoices = useCallback(
    async (workspaceId: string) => {
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
          error instanceof Error ? error.message : t("customerLedger.listLoadFailed")
        );
      } finally {
        if (seq === listSeq.current) {
          setListLoading(false);
        }
      }
    },
    [t]
  );

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
          setDetailError(t("customerLedger.detailNotFound"));
          onSelectedInvoiceIdChange?.(null, { replace: true });
          return;
        }
        setDetailError(
          error instanceof Error ? error.message : t("customerLedger.detailLoadFailed")
        );
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedInvoiceIdChange, t]
  );

  const loadLinkedAccruals = useCallback(
    async (workspaceId: string, invoiceId: string) => {
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
            : t("customerLedger.linkedAccrualsLoadFailed")
        );
      }
    },
    [t]
  );

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
    setCreateAccrualSuccessMeta(null);
    setCreateAccrualError(null);
    setCreateAccrualBaseline(null);
    onSelectedInvoiceIdChange?.(null);
    onSelectedCounterpartyChange?.(key);
  }

  function closeCustomer() {
    setCreateAccrualBaseline(null);
    setCreateAccrualError(null);
    setCreateAccrualSuccessMeta(null);
    onSelectedInvoiceIdChange?.(null);
    onSelectedCounterpartyChange?.(null);
  }

  function openInvoiceRow(invoiceId: string) {
    setCreateAccrualBaseline(null);
    setCreateAccrualError(null);
    setCreateAccrualSuccessMeta(null);
    onSelectedInvoiceIdChange?.(invoiceId);
  }

  function startCreateAccrual(invoice: Invoice) {
    if (!canCreateAccrualFromInvoice(invoice) || createAccrualBusyRef.current) {
      return;
    }
    setCreateAccrualError(null);
    setCreateAccrualSuccessMeta(null);
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
      setCreateAccrualError(t("customerLedger.createValidationFailed"));
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
      setCreateAccrualSuccessMeta({
        id: created.id.slice(0, 8),
        status: created.status
      });
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
      <Panel title={t("customerLedger.title")} headingId="customer-ledger-heading">
        <StatusMessage>{t("customerLedger.needWorkspace")}</StatusMessage>
      </Panel>
    );
  }

  const truncated = listTotalCount > invoices.length;
  const emDash = t("emDash", { ns: "common" });

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{t("customerLedger.eyebrow")}</p>
        <h1>{t("customerLedger.title")}</h1>
        <p className="lede">{t("customerLedger.lede")}</p>
      </header>

      <Panel
        title={t("customerLedger.listTitle")}
        headingId="customer-ledger-list-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadIssuedInvoices(workspace.id)}
          >
            {listLoading ? t("loading", { ns: "common" }) : t("refresh", { ns: "common" })}
          </button>
        }
      >
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            {t("customerLedger.searchLabel")}
            <input
              type="text"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              disabled={listLoading}
              placeholder={t("customerLedger.searchPlaceholder")}
              aria-label={t("customerLedger.searchLabel")}
            />
          </label>
          <label>
            {t("customerLedger.agingBucketLabel")}
            <select
              value={agingDraft}
              onChange={(event) =>
                setAgingDraft(event.target.value as AgingBucketFilter)
              }
              disabled={listLoading}
              aria-label={t("customerLedger.agingBucketLabel")}
            >
              {AGING_BUCKET_OPTIONS.map((option) => (
                <option key={option.id || "all"} value={option.id}>
                  {t(agingBucketKey(option.id))}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" disabled={listLoading}>
              {t("applyFilter", { ns: "common" })}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={listLoading}
              onClick={clearFilters}
            >
              {t("clearFilter", { ns: "common" })}
            </button>
          </div>
        </form>

        <ListLoadState
          loading={listLoading && invoices.length === 0}
          loadingMessage={t("customerLedger.listLoading")}
          error={listError}
          onRetry={() => void loadIssuedInvoices(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && summaries.length === 0}
          emptyMessage={t("customerLedger.listEmpty")}
        />

        {truncated ? (
          <StatusMessage>
            {t("customerLedger.listTruncated", {
              loaded: invoices.length,
              total: listTotalCount,
              limit: CUSTOMER_LEDGER_PAGE_SIZE
            })}
          </StatusMessage>
        ) : null}

        {!listError && summaries.length > 0 && visibleSummaries.length === 0 ? (
          <StatusMessage>{t("customerLedger.listFilteredEmpty")}</StatusMessage>
        ) : null}

        {!listError && visibleSummaries.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("customerLedger.col.counterparty")}</th>
                  <th>{t("customerLedger.col.invoices")}</th>
                  <th>{t("customerLedger.col.amount")}</th>
                  <th>{t("customerLedger.col.currency")}</th>
                  <th>{t("customerLedger.col.aging")}</th>
                  <th>{t("customerLedger.col.overdue")}</th>
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
                      <td>
                        {customerLedgerCurrencyLabel(row.currencies, emDash)}
                      </td>
                      <td>{localizeAgingBadge(row, t)}</td>
                      <td>
                        {row.overdueCount}
                        {row.dueTodayCount > 0
                          ? t("customerLedger.dueTodaySuffix", {
                              count: row.dueTodayCount
                            })
                          : ""}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => openCustomer(row.counterpartyReference)}
                        >
                          {t("open", { ns: "common" })}
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
          title={t("customerLedger.detailTitleNamed", {
            counterparty: selectedCounterparty
          })}
          headingId="customer-ledger-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeCustomer}>
              {t("close", { ns: "common" })}
            </button>
          }
        >
          <dl className="facts">
            <div>
              <dt>{t("customerLedger.col.counterparty")}</dt>
              <dd className="mono">{selectedSummary.counterpartyReference}</dd>
            </div>
            <div>
              <dt>{t("customerLedger.openInvoices")}</dt>
              <dd>{selectedSummary.invoiceCount}</dd>
            </div>
            <div>
              <dt>{t("customerLedger.col.amount")}</dt>
              <dd>
                {formatMoney(
                  selectedSummary.totalAmount,
                  selectedSummary.currencies[0] ?? workspace.defaultCurrency
                )}
              </dd>
            </div>
            <div>
              <dt>{t("customerLedger.col.aging")}</dt>
              <dd>{localizeAgingBadge(selectedSummary, t)}</dd>
            </div>
          </dl>

          <div className="filter-actions">
            {onOpenCollections ? (
              <button
                type="button"
                onClick={() => onOpenCollections(selectedCounterparty)}
              >
                {t("customerLedger.openCollections")}
              </button>
            ) : null}
          </div>

          {openItems.length === 0 ? (
            <StatusMessage>{t("customerLedger.openItemsEmpty")}</StatusMessage>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("customerLedger.col.document")}</th>
                    <th>{t("customerLedger.col.due")}</th>
                    <th>{t("customerLedger.col.aging")}</th>
                    <th>{t("customerLedger.col.amount")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {openItems.map((row) => {
                    const aging = localizeAgingPresentation(
                      classifyDueDateAging(row.dueDateUtc),
                      t
                    );
                    const selected = row.id === selectedInvoiceId;
                    return (
                      <tr
                        key={row.id}
                        data-row-id={row.id}
                        className={selected ? "row-highlight row-selected" : undefined}
                      >
                        <td className="mono cell-wrap">{row.documentNumber}</td>
                        <td>
                          {row.dueDateUtc ? formatDate(row.dueDateUtc) : emDash}
                        </td>
                        <td>
                          {aging.label}
                          {aging.dayOffsetLabel !== emDash
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
                            {t("customerLedger.details")}
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
        <Panel
          title={t("customerLedger.detailTitle")}
          headingId="customer-ledger-detail-empty-heading"
        >
          <StatusMessage>{t("customerLedger.selectPrompt")}</StatusMessage>
        </Panel>
      )}

      {selectedInvoiceId ? (
        <Panel
          title={t("customerLedger.invoiceDetailTitle")}
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
              {t("close", { ns: "common" })}
            </button>
          }
        >
          <ListLoadState
            loading={detailLoading && !detailInvoice}
            loadingMessage={t("customerLedger.detailLoading")}
            error={detailError}
            onRetry={() => void loadInvoiceDetail(workspace.id, selectedInvoiceId)}
            retryDisabled={detailLoading}
            empty={false}
            emptyMessage=""
          />

          {createAccrualSuccessMeta ? (
            <StatusMessage tone="success">
              {t("customerLedger.createSuccess", {
                id: createAccrualSuccessMeta.id,
                status: localizeAccrualStatus(createAccrualSuccessMeta.status, t)
              })}
            </StatusMessage>
          ) : null}
          {createAccrualError && !createAccrualBaseline ? (
            <StatusMessage tone="error">{createAccrualError}</StatusMessage>
          ) : null}

          {detailInvoice ? (
            <>
              <dl className="facts">
                <div>
                  <dt>{t("customerLedger.col.document")}</dt>
                  <dd className="mono">{detailInvoice.documentNumber}</dd>
                </div>
                <div>
                  <dt>{t("customerLedger.col.counterparty")}</dt>
                  <dd className="mono">{detailInvoice.counterpartyReference}</dd>
                </div>
                <div>
                  <dt>{t("customerLedger.col.status")}</dt>
                  <dd>{localizeInvoiceStatus(detailInvoice.status, t)}</dd>
                </div>
                <div>
                  <dt>{t("customerLedger.field.dueDate")}</dt>
                  <dd>
                    {detailInvoice.dueDateUtc
                      ? formatDate(detailInvoice.dueDateUtc)
                      : emDash}
                  </dd>
                </div>
                <div>
                  <dt>{t("customerLedger.col.amount")}</dt>
                  <dd>
                    {formatMoney(detailInvoice.totalAmount, detailInvoice.currency)}
                  </dd>
                </div>
                <div>
                  <dt>{t("customerLedger.col.aging")}</dt>
                  <dd>
                    {
                      localizeAgingPresentation(
                        classifyDueDateAging(detailInvoice.dueDateUtc),
                        t
                      ).label
                    }
                  </dd>
                </div>
              </dl>

              <p className="meta">
                {
                  localizeAgingPresentation(
                    classifyDueDateAging(detailInvoice.dueDateUtc),
                    t
                  ).explanation
                }
              </p>

              <div className="filter-actions">
                {onOpenInvoice ? (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => onOpenInvoice(detailInvoice.id)}
                  >
                    {t("customerLedger.openInInvoices")}
                  </button>
                ) : null}
                {canCreateAccrualFromInvoice(detailInvoice) ? (
                  <button
                    type="button"
                    disabled={createAccrualBusy || Boolean(createAccrualBaseline)}
                    onClick={() => startCreateAccrual(detailInvoice)}
                  >
                    {t("customerLedger.createAccrual")}
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
                <strong>{t("customerLedger.linkedAccruals")}</strong>
              </p>
              {linkedAccrualsError ? (
                <StatusMessage tone="error">{linkedAccrualsError}</StatusMessage>
              ) : null}
              {linkedAccruals.length === 0 && !linkedAccrualsError ? (
                <StatusMessage>{t("customerLedger.linkedAccrualsEmpty")}</StatusMessage>
              ) : null}
              {linkedAccruals.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("customerLedger.col.accrual")}</th>
                        <th>{t("customerLedger.col.type")}</th>
                        <th>{t("customerLedger.col.status")}</th>
                        <th>{t("customerLedger.col.amount")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {linkedAccruals.map((accrual) => (
                        <tr key={accrual.id} data-row-id={accrual.id}>
                          <td className="mono cell-wrap">{accrual.id}</td>
                          <td>{localizeAccrualType(accrual.type, t)}</td>
                          <td>{localizeAccrualStatus(accrual.status, t)}</td>
                          <td>{formatMoney(accrual.amount, accrual.currency)}</td>
                          <td>
                            {onOpenAccrual ? (
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => onOpenAccrual(accrual.id)}
                              >
                                {t("customerLedger.openAccrual")}
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
