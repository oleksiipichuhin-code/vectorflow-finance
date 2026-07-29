import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  FinanceApiRequestError,
  getAccountStatement,
  listAccountBalances,
  type AccountBalance,
  type AccountStatement,
  type FinanceWorkspace
} from "./api";
import {
  EMPTY_STATEMENT_PERIOD,
  buildStatementPeriodQuery,
  type StatementPeriodFilters
} from "./accountStatement";
import { formatBalanceSide } from "./trialBalance";
import { formatDate, formatMoney } from "./format";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";

type AccountIdChangeOptions = {
  replace?: boolean;
};

type AccountStatementViewProps = {
  workspace: FinanceWorkspace | null;
  selectedAccountId?: string | null;
  initialPeriodFrom?: string;
  initialPeriodTo?: string;
  onSelectedAccountIdChange?: (
    accountId: string | null,
    options?: AccountIdChangeOptions
  ) => void;
  onPeriodChange?: (periodFromDate: string, periodToDate: string) => void;
  onOpenJournal?: (journalEntryId: string) => void;
};

export function AccountStatementView({
  workspace,
  selectedAccountId = null,
  initialPeriodFrom = "",
  initialPeriodTo = "",
  onSelectedAccountIdChange,
  onPeriodChange,
  onOpenJournal
}: AccountStatementViewProps) {
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [periodFrom, setPeriodFrom] = useState(initialPeriodFrom);
  const [periodTo, setPeriodTo] = useState(initialPeriodTo);
  const [appliedPeriod, setAppliedPeriod] = useState<StatementPeriodFilters>({
    periodFromDate: initialPeriodFrom,
    periodToDate: initialPeriodTo
  });
  const [periodValidationError, setPeriodValidationError] = useState<string | null>(null);

  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const listSeq = useRef(0);
  const detailSeq = useRef(0);

  const loadBalances = useCallback(async (workspaceId: string) => {
    const seq = ++listSeq.current;
    setListLoading(true);
    setListError(null);
    try {
      const next = await listAccountBalances(workspaceId);
      if (seq !== listSeq.current) {
        return;
      }
      setBalances(next);
    } catch (error) {
      if (seq !== listSeq.current) {
        return;
      }
      setBalances([]);
      setListError(
        error instanceof Error ? error.message : "Не вдалося завантажити залишки рахунків."
      );
    } finally {
      if (seq === listSeq.current) {
        setListLoading(false);
      }
    }
  }, []);

  const loadStatement = useCallback(
    async (workspaceId: string, accountId: string, period: StatementPeriodFilters) => {
      const built = buildStatementPeriodQuery(period);
      if (built.validationError) {
        setPeriodValidationError(built.validationError);
        setDetailError(null);
        setStatement(null);
        return;
      }

      const seq = ++detailSeq.current;
      setDetailLoading(true);
      setDetailError(null);
      setPeriodValidationError(null);

      try {
        const next = await getAccountStatement(workspaceId, accountId, built.query);
        if (seq !== detailSeq.current) {
          return;
        }
        setStatement(next);
      } catch (error) {
        if (seq !== detailSeq.current) {
          return;
        }
        setStatement(null);
        if (error instanceof FinanceApiRequestError && error.status === 404) {
          setDetailError("Рахунок не знайдено в цьому workspace.");
          onSelectedAccountIdChange?.(null, { replace: true });
          return;
        }
        setDetailError(
          error instanceof Error ? error.message : "Не вдалося завантажити виписку рахунку."
        );
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedAccountIdChange]
  );

  useEffect(() => {
    if (!workspace) {
      setBalances([]);
      setListError(null);
      setListLoading(false);
      return;
    }
    void loadBalances(workspace.id);
    return () => {
      listSeq.current += 1;
    };
  }, [workspace, loadBalances]);

  useEffect(() => {
    if (!workspace || !selectedAccountId) {
      setStatement(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    void loadStatement(workspace.id, selectedAccountId, appliedPeriod);
    return () => {
      detailSeq.current += 1;
    };
  }, [workspace, selectedAccountId, appliedPeriod, loadStatement]);

  function openAccount(accountId: string) {
    onSelectedAccountIdChange?.(accountId);
  }

  function closeDetail() {
    setStatement(null);
    setDetailError(null);
    onSelectedAccountIdChange?.(null);
  }

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: StatementPeriodFilters = {
      periodFromDate: periodFrom.trim(),
      periodToDate: periodTo.trim()
    };
    const built = buildStatementPeriodQuery(next);
    if (built.validationError) {
      setPeriodValidationError(built.validationError);
      return;
    }
    setPeriodValidationError(null);
    setAppliedPeriod(next);
    onPeriodChange?.(next.periodFromDate, next.periodToDate);
  }

  function clearPeriod() {
    setPeriodFrom("");
    setPeriodTo("");
    setPeriodValidationError(null);
    setAppliedPeriod({ ...EMPTY_STATEMENT_PERIOD });
    onPeriodChange?.("", "");
  }

  if (!workspace) {
    return (
      <Panel title="Account statement" headingId="account-statement-heading">
        <StatusMessage>Спочатку відкрийте finance workspace.</StatusMessage>
      </Panel>
    );
  }

  const currency = workspace.defaultCurrency;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">General ledger</p>
        <h1>Account statement</h1>
        <p className="lede">
          Список залишків рахунків → виписка за ledger postings → фільтр періоду. Стан у
          shareable URL.
        </p>
      </header>

      <Panel
        title="Залишки рахунків"
        headingId="account-balances-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadBalances(workspace.id)}
          >
            {listLoading ? "Завантаження…" : "Оновити"}
          </button>
        }
      >
        <ListLoadState
          loading={listLoading && balances.length === 0}
          loadingMessage="Завантаження залишків…"
          error={listError}
          onRetry={() => void loadBalances(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && balances.length === 0}
          emptyMessage="Немає рахунків у workspace. Створіть рахунки та проведіть journal entry у Journals."
        />

        {!listError && balances.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                  <th>Side</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => {
                  const selected = row.accountId === selectedAccountId;
                  return (
                    <tr
                      key={row.accountId}
                      data-row-id={row.accountId}
                      className={selected ? "row-highlight row-selected" : undefined}
                    >
                      <td className="mono">{row.accountCode}</td>
                      <td className="cell-wrap">{row.accountName}</td>
                      <td>{formatMoney(row.debitTotal, currency)}</td>
                      <td>{formatMoney(row.creditTotal, currency)}</td>
                      <td>{formatMoney(Math.abs(row.balance), currency)}</td>
                      <td>{formatBalanceSide(row.balanceSide)}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={detailLoading}
                          onClick={() => openAccount(row.accountId)}
                        >
                          Виписка
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

      {selectedAccountId ? (
        <Panel
          title="Виписка рахунку"
          headingId="account-statement-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeDetail}>
              Закрити
            </button>
          }
        >
          <form className="filter-form" onSubmit={applyPeriod}>
            <label>
              Period from
              <input
                type="date"
                value={periodFrom}
                onChange={(event) => setPeriodFrom(event.target.value)}
                disabled={detailLoading}
              />
            </label>
            <label>
              Period to
              <input
                type="date"
                value={periodTo}
                onChange={(event) => setPeriodTo(event.target.value)}
                disabled={detailLoading}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={detailLoading}>
                Застосувати період
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={detailLoading}
                onClick={clearPeriod}
              >
                Скинути період
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={detailLoading || !selectedAccountId}
                onClick={() =>
                  void loadStatement(workspace.id, selectedAccountId, appliedPeriod)
                }
              >
                Оновити виписку
              </button>
            </div>
          </form>

          {periodValidationError ? (
            <StatusMessage tone="error">{periodValidationError}</StatusMessage>
          ) : null}

          <ListLoadState
            loading={detailLoading && !statement}
            loadingMessage="Завантаження виписки…"
            error={detailError}
            onRetry={() =>
              void loadStatement(workspace.id, selectedAccountId, appliedPeriod)
            }
            retryDisabled={detailLoading}
            empty={false}
            emptyMessage=""
          />

          {statement ? (
            <>
              <div className="queue-banner" role="status">
                <p className="queue-banner-title">
                  {statement.accountCode} · {statement.accountName}
                </p>
                <dl className="facts">
                  <div>
                    <dt>Opening</dt>
                    <dd>
                      {formatMoney(statement.openingDebit, currency)} /{" "}
                      {formatMoney(statement.openingCredit, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Period</dt>
                    <dd>
                      {formatMoney(statement.periodDebit, currency)} /{" "}
                      {formatMoney(statement.periodCredit, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Closing</dt>
                    <dd>
                      {formatMoney(statement.closingDebit, currency)} /{" "}
                      {formatMoney(statement.closingCredit, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Period bounds</dt>
                    <dd>
                      {formatDate(statement.periodFromUtc)} — {formatDate(statement.periodToUtc)}
                    </dd>
                  </div>
                </dl>
              </div>

              {statement.lines.length === 0 ? (
                <StatusMessage>
                  Немає рухів за обраний період для цього рахунку.
                </StatusMessage>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Posted</th>
                        <th>Description</th>
                        <th>Debit</th>
                        <th>Credit</th>
                        <th>Running D/C</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {statement.lines.map((line) => (
                        <tr
                          key={`${line.ledgerPostingId}-${line.sourceJournalEntryLineId}`}
                          data-row-id={line.sourceJournalEntryLineId}
                        >
                          <td>{formatDate(line.postedAtUtc)}</td>
                          <td className="cell-wrap">{line.description?.trim() || "—"}</td>
                          <td>{formatMoney(line.debit, currency)}</td>
                          <td>{formatMoney(line.credit, currency)}</td>
                          <td>
                            {formatMoney(line.runningDebit, currency)} /{" "}
                            {formatMoney(line.runningCredit, currency)}
                          </td>
                          <td>
                            {onOpenJournal ? (
                              <button
                                type="button"
                                className="button-secondary"
                                onClick={() => onOpenJournal(line.journalEntryId)}
                              >
                                Journal entry
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailLoading ? <StatusMessage>Оновлення…</StatusMessage> : null}
            </>
          ) : null}
        </Panel>
      ) : (
        <Panel title="Виписка рахунку" headingId="account-statement-empty-heading">
          <StatusMessage>Оберіть рахунок у списку залишків, щоб відкрити виписку.</StatusMessage>
        </Panel>
      )}
    </>
  );
}
