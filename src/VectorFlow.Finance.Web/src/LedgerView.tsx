import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatDate, formatMoney } from "./format";
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

  const loadPostings = useCallback(async (workspaceId: string) => {
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
        error instanceof Error ? error.message : "Не вдалося завантажити ledger postings."
      );
    } finally {
      if (seq === listSeq.current) {
        setListLoading(false);
      }
    }
  }, []);

  const loadDetail = useCallback(
    async (workspaceId: string, ledgerPostingId: string) => {
      if (!isLedgerPostingId(ledgerPostingId)) {
        setDetail(null);
        setDetailError("Некоректний ідентифікатор ledger posting.");
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
        setDetailSuccess("Ledger posting завантажено з API.");
      } catch (error) {
        if (seq !== detailSeq.current) {
          return;
        }
        setDetail(null);
        if (error instanceof FinanceApiRequestError && error.status === 404) {
          setDetailError("Ledger posting не знайдено у цьому workspace.");
          onSelectedLedgerPostingIdChange?.(null, { replace: true });
        } else {
          setDetailError(
            error instanceof Error ? error.message : "Не вдалося завантажити ledger posting."
          );
        }
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedLedgerPostingIdChange]
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
      setFilterValidationError("Source journal entry id має бути валідним GUID.");
      return;
    }

    const result = filterLedgerPostings(postings, nextPeriod, nextJournal);
    if (result.validationError) {
      setFilterValidationError(result.validationError);
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
      <Panel title="Ledger" headingId="ledger-heading">
        <StatusMessage>Спочатку відкрийте finance workspace.</StatusMessage>
      </Panel>
    );
  }

  const currency = workspace.defaultCurrency;
  const visible = filtered.validationError ? [] : filtered.items;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">General ledger</p>
        <h1>Ledger</h1>
        <p className="lede">
          Реєстр immutable ledger postings → фільтр за датою / journal entry → деталі та
          handoff. Стан у shareable URL.
        </p>
      </header>

      <Panel
        title="Ledger postings"
        headingId="ledger-list-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadPostings(workspace.id)}
          >
            {listLoading ? "Завантаження…" : "Оновити"}
          </button>
        }
      >
        <form className="filter-form" onSubmit={applyFilters}>
          <label>
            Posted from
            <input
              type="date"
              value={postedFrom}
              onChange={(event) => setPostedFrom(event.target.value)}
              disabled={listLoading}
            />
          </label>
          <label>
            Posted to
            <input
              type="date"
              value={postedTo}
              onChange={(event) => setPostedTo(event.target.value)}
              disabled={listLoading}
            />
          </label>
          <label>
            Source journal entry
            <input
              type="text"
              className="mono"
              placeholder="GUID journal entry"
              value={sourceJournalEntryId}
              onChange={(event) => setSourceJournalEntryId(event.target.value)}
              disabled={listLoading}
            />
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

        {filterValidationError ? (
          <StatusMessage tone="error">{filterValidationError}</StatusMessage>
        ) : null}

        <ListLoadState
          loading={listLoading && postings.length === 0}
          loadingMessage="Завантаження ledger postings…"
          error={listError}
          onRetry={() => void loadPostings(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && postings.length === 0}
          emptyMessage="Немає ledger postings. Проведіть journal entry та Post to ledger у Journals."
        />

        {!listError && postings.length > 0 && visible.length === 0 && !filterValidationError ? (
          <StatusMessage>Немає postings за обраним фільтром.</StatusMessage>
        ) : null}

        {!listError && visible.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Posted</th>
                  <th>Ledger posting</th>
                  <th>Journal entry</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Lines</th>
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

      {selectedLedgerPostingId ? (
        <Panel
          title="Деталі ledger posting"
          headingId="ledger-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeDetail}>
              Закрити
            </button>
          }
        >
          <ListLoadState
            loading={detailLoading && !detail}
            loadingMessage="Завантаження деталей…"
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
                  <dt>Ledger posting</dt>
                  <dd className="mono">{detail.id}</dd>
                </div>
                <div>
                  <dt>Journal entry</dt>
                  <dd className="mono">{detail.journalEntryId}</dd>
                </div>
                <div>
                  <dt>Posted</dt>
                  <dd>{formatDate(detail.postedAtUtc)}</dd>
                </div>
                <div>
                  <dt>Totals</dt>
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
                    Journal entry
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button-secondary"
                  disabled={detailLoading}
                  onClick={() => void loadDetail(workspace.id, detail.id)}
                >
                  Оновити з API
                </button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Account</th>
                      <th>Description</th>
                      <th>Debit</th>
                      <th>Credit</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id} data-row-id={line.id}>
                        <td>{line.sequence}</td>
                        <td className="mono cell-wrap">{line.financialAccountId}</td>
                        <td className="cell-wrap">{line.description?.trim() || "—"}</td>
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
                              Account statement
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailLoading ? <StatusMessage>Оновлення…</StatusMessage> : null}
            </>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Деталі ledger posting" headingId="ledger-detail-empty-heading">
          <StatusMessage>Оберіть posting у списку, щоб відкрити деталі.</StatusMessage>
        </Panel>
      )}
    </>
  );
}
