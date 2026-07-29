import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FinanceApiRequestError,
  getLedgerPosting,
  listLedgerPostings,
  type FinanceWorkspace,
  type LedgerPosting
} from "./api";
import {
  EMPTY_LEDGER_POSTED_PERIOD,
  filterLedgerPostings,
  isLedgerPostingId,
  parseSourceJournalEntryIdFilter,
  type LedgerPostedPeriodFilters
} from "./ledgerPostings";
import { formatDate, formatMoney } from "./i18n/format.ts";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";

type LedgerPostingIdChangeOptions = {
  replace?: boolean;
};

type LedgerViewProps = {
  workspace: FinanceWorkspace | null;
  selectedLedgerPostingId?: string | null;
  initialPostedFrom?: string;
  initialPostedTo?: string;
  initialSourceJournalEntryId?: string;
  onSelectedLedgerPostingIdChange?: (
    ledgerPostingId: string | null,
    options?: LedgerPostingIdChangeOptions
  ) => void;
  onFilterChange?: (
    postedFromDate: string,
    postedToDate: string,
    sourceJournalEntryId: string
  ) => void;
  onOpenJournal?: (journalEntryId: string) => void;
  onOpenAccountStatement?: (accountId: string) => void;
};

export function LedgerView({
  workspace,
  selectedLedgerPostingId = null,
  initialPostedFrom = "",
  initialPostedTo = "",
  initialSourceJournalEntryId = "",
  onSelectedLedgerPostingIdChange,
  onFilterChange,
  onOpenJournal,
  onOpenAccountStatement
}: LedgerViewProps) {
  const { t } = useTranslation(["finance", "common"]);
  const [postings, setPostings] = useState<LedgerPosting[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [postedFrom, setPostedFrom] = useState(initialPostedFrom);
  const [postedTo, setPostedTo] = useState(initialPostedTo);
  const [sourceJournalEntryId, setSourceJournalEntryId] = useState(
    initialSourceJournalEntryId
  );
  const [appliedFilters, setAppliedFilters] = useState<LedgerPostedPeriodFilters>({
    postedFromDate: initialPostedFrom,
    postedToDate: initialPostedTo
  });
  const [appliedJournalFilter, setAppliedJournalFilter] = useState(
    parseSourceJournalEntryIdFilter(initialSourceJournalEntryId)
  );
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);

  const [detail, setDetail] = useState<LedgerPosting | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSuccess, setDetailSuccess] = useState<string | null>(null);

  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  const loadPostings = useCallback(
    async (workspaceId: string) => {
      const seq = ++listSeq.current;
      setListLoading(true);
      setListError(null);
      try {
        const next = await listLedgerPostings(workspaceId);
        if (seq !== listSeq.current) {
          return;
        }
        setPostings(next);
      } catch (error) {
        if (seq !== listSeq.current) {
          return;
        }
        setPostings([]);
        setListError(
          error instanceof Error ? error.message : t("ledger.listLoadFailed")
        );
      } finally {
        if (seq === listSeq.current) {
          setListLoading(false);
        }
      }
    },
    [t]
  );

  const loadDetail = useCallback(
    async (workspaceId: string, ledgerPostingId: string) => {
      if (!isLedgerPostingId(ledgerPostingId)) {
        setDetail(null);
        setDetailError(t("ledger.detailInvalidId"));
        setDetailSuccess(null);
        return;
      }

      const seq = ++detailSeq.current;
      setDetailLoading(true);
      setDetailError(null);
      setDetailSuccess(null);
      try {
        const next = await getLedgerPosting(workspaceId, ledgerPostingId);
        if (seq !== detailSeq.current) {
          return;
        }
        setDetail(next);
        setDetailSuccess(t("ledger.detailLoaded"));
      } catch (error) {
        if (seq !== detailSeq.current) {
          return;
        }
        setDetail(null);
        if (error instanceof FinanceApiRequestError && error.status === 404) {
          setDetailError(t("ledger.detailNotFound"));
          onSelectedLedgerPostingIdChange?.(null, { replace: true });
        } else {
          setDetailError(
            error instanceof Error ? error.message : t("ledger.detailLoadFailed")
          );
        }
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedLedgerPostingIdChange, t]
  );

  useEffect(() => {
    if (!workspace) {
      setPostings([]);
      setListError(null);
      setListLoading(false);
      setDetail(null);
      setDetailError(null);
      setDetailSuccess(null);
      return;
    }

    void loadPostings(workspace.id);
    return () => {
      listSeq.current += 1;
    };
  }, [workspace, loadPostings]);

  useEffect(() => {
    if (!workspace || !selectedLedgerPostingId) {
      setDetail(null);
      setDetailError(null);
      setDetailSuccess(null);
      return;
    }

    void loadDetail(workspace.id, selectedLedgerPostingId);
    return () => {
      detailSeq.current += 1;
    };
  }, [workspace, selectedLedgerPostingId, loadDetail]);

  const filtered = useMemo(
    () => filterLedgerPostings(postings, appliedFilters, appliedJournalFilter),
    [postings, appliedFilters, appliedJournalFilter]
  );

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const nextPeriod: LedgerPostedPeriodFilters = {
      postedFromDate: postedFrom.trim(),
      postedToDate: postedTo.trim()
    };
    const nextJournal = parseSourceJournalEntryIdFilter(sourceJournalEntryId);
    if (sourceJournalEntryId.trim() && !nextJournal) {
      setFilterValidationError(t("ledger.journalIdInvalid"));
      return;
    }

    const result = filterLedgerPostings(postings, nextPeriod, nextJournal);
    if (result.validationError) {
      setFilterValidationError(t("ledger.periodRangeInvalid"));
      return;
    }

    setFilterValidationError(null);
    setAppliedFilters(nextPeriod);
    setAppliedJournalFilter(nextJournal);
    setSourceJournalEntryId(nextJournal);
    onFilterChange?.(nextPeriod.postedFromDate, nextPeriod.postedToDate, nextJournal);
  }

  function clearFilters() {
    setPostedFrom("");
    setPostedTo("");
    setSourceJournalEntryId("");
    setFilterValidationError(null);
    setAppliedFilters(EMPTY_LEDGER_POSTED_PERIOD);
    setAppliedJournalFilter("");
    onFilterChange?.("", "", "");
  }

  function openPosting(ledgerPostingId: string) {
    onSelectedLedgerPostingIdChange?.(ledgerPostingId);
  }

  function closeDetail() {
    setDetail(null);
    setDetailError(null);
    setDetailSuccess(null);
    onSelectedLedgerPostingIdChange?.(null);
  }

  if (!workspace) {
    return (
      <Panel title={t("ledger.title")} headingId="ledger-heading">
        <StatusMessage>{t("ledger.needWorkspace")}</StatusMessage>
      </Panel>
    );
  }

  const currency = workspace.defaultCurrency;
  const visible = filtered.validationError ? [] : filtered.items;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{t("ledger.eyebrow")}</p>
        <h1>{t("ledger.title")}</h1>
        <p className="lede">{t("ledger.lede")}</p>
      </header>

      <Panel
        title={t("ledger.listTitle")}
        headingId="ledger-list-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadPostings(workspace.id)}
          >
            {listLoading ? t("loading", { ns: "common" }) : t("refresh", { ns: "common" })}
          </button>
        }
      >
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            {t("ledger.field.postedFrom")}
            <input
              type="date"
              value={postedFrom}
              onChange={(event) => setPostedFrom(event.target.value)}
              disabled={listLoading}
            />
          </label>
          <label>
            {t("ledger.field.postedTo")}
            <input
              type="date"
              value={postedTo}
              onChange={(event) => setPostedTo(event.target.value)}
              disabled={listLoading}
            />
          </label>
          <label>
            {t("ledger.field.sourceJournal")}
            <input
              type="text"
              className="mono"
              placeholder={t("ledger.journalPlaceholder")}
              value={sourceJournalEntryId}
              onChange={(event) => setSourceJournalEntryId(event.target.value)}
              disabled={listLoading}
            />
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

        {filterValidationError ? (
          <StatusMessage tone="error">{filterValidationError}</StatusMessage>
        ) : null}

        <ListLoadState
          loading={listLoading && postings.length === 0}
          loadingMessage={t("ledger.listLoading")}
          error={listError}
          onRetry={() => void loadPostings(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && postings.length === 0}
          emptyMessage={t("ledger.listEmpty")}
        />

        {!listError && postings.length > 0 && visible.length === 0 && !filterValidationError ? (
          <StatusMessage>{t("ledger.listFilteredEmpty")}</StatusMessage>
        ) : null}

        {!listError && visible.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("ledger.col.posted")}</th>
                  <th>{t("ledger.col.ledgerPosting")}</th>
                  <th>{t("ledger.col.journalEntry")}</th>
                  <th>{t("ledger.col.debit")}</th>
                  <th>{t("ledger.col.credit")}</th>
                  <th>{t("ledger.col.lines")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const selected = row.id === selectedLedgerPostingId;
                  return (
                    <tr
                      key={row.id}
                      data-row-id={row.id}
                      className={selected ? "row-highlight row-selected" : undefined}
                    >
                      <td>{formatDate(row.postedAtUtc)}</td>
                      <td className="mono cell-wrap">{row.id}</td>
                      <td className="mono cell-wrap">{row.journalEntryId}</td>
                      <td>{formatMoney(row.totalDebit, currency)}</td>
                      <td>{formatMoney(row.totalCredit, currency)}</td>
                      <td>{row.lines.length}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={detailLoading}
                          onClick={() => openPosting(row.id)}
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

      {selectedLedgerPostingId ? (
        <Panel
          title={t("ledger.detailTitle")}
          headingId="ledger-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeDetail}>
              {t("close", { ns: "common" })}
            </button>
          }
        >
          <ListLoadState
            loading={detailLoading && !detail}
            loadingMessage={t("ledger.detailLoading")}
            error={detailError}
            onRetry={() => void loadDetail(workspace.id, selectedLedgerPostingId)}
            retryDisabled={detailLoading}
            empty={false}
            emptyMessage=""
          />

          {detailSuccess ? <StatusMessage tone="success">{detailSuccess}</StatusMessage> : null}

          {detail ? (
            <>
              <dl className="facts">
                <div>
                  <dt>{t("ledger.col.ledgerPosting")}</dt>
                  <dd className="mono">{detail.id}</dd>
                </div>
                <div>
                  <dt>{t("ledger.col.journalEntry")}</dt>
                  <dd className="mono">{detail.journalEntryId}</dd>
                </div>
                <div>
                  <dt>{t("ledger.col.posted")}</dt>
                  <dd>{formatDate(detail.postedAtUtc)}</dd>
                </div>
                <div>
                  <dt>{t("ledger.field.totals")}</dt>
                  <dd>
                    {formatMoney(detail.totalDebit, currency)} /{" "}
                    {formatMoney(detail.totalCredit, currency)}
                  </dd>
                </div>
              </dl>

              <div className="filter-actions">
                {onOpenJournal ? (
                  <button
                    type="button"
                    onClick={() => onOpenJournal(detail.journalEntryId)}
                  >
                    {t("ledger.openJournal")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button-secondary"
                  disabled={detailLoading}
                  onClick={() => void loadDetail(workspace.id, detail.id)}
                >
                  {t("refreshFromApi")}
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("ledger.col.sequence")}</th>
                      <th>{t("ledger.col.account")}</th>
                      <th>{t("ledger.col.description")}</th>
                      <th>{t("ledger.col.debit")}</th>
                      <th>{t("ledger.col.credit")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id} data-row-id={line.id}>
                        <td>{line.sequence}</td>
                        <td className="mono cell-wrap">{line.financialAccountId}</td>
                        <td className="cell-wrap">
                          {line.description?.trim() || t("emDash", { ns: "common" })}
                        </td>
                        <td>{formatMoney(line.debit, currency)}</td>
                        <td>{formatMoney(line.credit, currency)}</td>
                        <td>
                          {onOpenAccountStatement ? (
                            <button
                              type="button"
                              className="button-secondary"
                              onClick={() =>
                                onOpenAccountStatement(line.financialAccountId)
                              }
                            >
                              {t("openAccountStatement")}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailLoading ? <StatusMessage>{t("ledger.updating")}</StatusMessage> : null}
            </>
          ) : null}
        </Panel>
      ) : (
        <Panel title={t("ledger.detailTitle")} headingId="ledger-detail-empty-heading">
          <StatusMessage>{t("ledger.selectPrompt")}</StatusMessage>
        </Panel>
      )}
    </>
  );
}
