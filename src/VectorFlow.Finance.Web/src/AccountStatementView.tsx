import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { formatDate, formatMoney } from "./i18n/format.ts";
import { formatBalanceSide } from "./trialBalance";
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
  const { t } = useTranslation(["finance", "common"]);
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

  const loadBalances = useCallback(
    async (workspaceId: string) => {
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
          error instanceof Error ? error.message : t("accountStatement.listLoadFailed")
        );
      } finally {
        if (seq === listSeq.current) {
          setListLoading(false);
        }
      }
    },
    [t]
  );

  const loadStatement = useCallback(
    async (workspaceId: string, accountId: string, period: StatementPeriodFilters) => {
      const built = buildStatementPeriodQuery(period);
      if (built.validationError) {
        setPeriodValidationError(t("accountStatement.periodRangeInvalid"));
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
          setDetailError(t("accountStatement.detailNotFound"));
          onSelectedAccountIdChange?.(null, { replace: true });
          return;
        }
        setDetailError(
          error instanceof Error ? error.message : t("accountStatement.detailLoadFailed")
        );
      } finally {
        if (seq === detailSeq.current) {
          setDetailLoading(false);
        }
      }
    },
    [onSelectedAccountIdChange, t]
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
      setPeriodValidationError(t("accountStatement.periodRangeInvalid"));
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
      <Panel title={t("accountStatement.title")} headingId="account-statement-heading">
        <StatusMessage>{t("accountStatement.needWorkspace")}</StatusMessage>
      </Panel>
    );
  }

  const currency = workspace.defaultCurrency;

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{t("accountStatement.eyebrow")}</p>
        <h1>{t("accountStatement.title")}</h1>
        <p className="lede">{t("accountStatement.lede")}</p>
      </header>

      <Panel
        title={t("accountStatement.balancesTitle")}
        headingId="account-balances-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={listLoading}
            onClick={() => void loadBalances(workspace.id)}
          >
            {listLoading ? t("loading", { ns: "common" }) : t("refresh", { ns: "common" })}
          </button>
        }
      >
        <ListLoadState
          loading={listLoading && balances.length === 0}
          loadingMessage={t("accountStatement.listLoading")}
          error={listError}
          onRetry={() => void loadBalances(workspace.id)}
          retryDisabled={listLoading}
          empty={!listLoading && !listError && balances.length === 0}
          emptyMessage={t("accountStatement.listEmpty")}
        />

        {!listError && balances.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("accountStatement.col.code")}</th>
                  <th>{t("accountStatement.col.name")}</th>
                  <th>{t("accountStatement.col.debit")}</th>
                  <th>{t("accountStatement.col.credit")}</th>
                  <th>{t("accountStatement.col.balance")}</th>
                  <th>{t("accountStatement.col.side")}</th>
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
                      <td>{formatBalanceSide(row.balanceSide, t)}</td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={detailLoading}
                          onClick={() => openAccount(row.accountId)}
                        >
                          {t("accountStatement.openStatement")}
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
          title={t("accountStatement.detailTitle")}
          headingId="account-statement-detail-heading"
          actions={
            <button type="button" className="button-secondary" onClick={closeDetail}>
              {t("close", { ns: "common" })}
            </button>
          }
        >
          <form className="filter-form" onSubmit={applyPeriod}>
            <label>
              {t("accountStatement.field.periodFrom")}
              <input
                type="date"
                value={periodFrom}
                onChange={(event) => setPeriodFrom(event.target.value)}
                disabled={detailLoading}
              />
            </label>
            <label>
              {t("accountStatement.field.periodTo")}
              <input
                type="date"
                value={periodTo}
                onChange={(event) => setPeriodTo(event.target.value)}
                disabled={detailLoading}
              />
            </label>
            <div className="filter-actions">
              <button type="submit" disabled={detailLoading}>
                {t("accountStatement.applyPeriod")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={detailLoading}
                onClick={clearPeriod}
              >
                {t("accountStatement.clearPeriod")}
              </button>
              <button
                type="button"
                className="button-secondary"
                disabled={detailLoading || !selectedAccountId}
                onClick={() =>
                  void loadStatement(workspace.id, selectedAccountId, appliedPeriod)
                }
              >
                {t("accountStatement.refreshStatement")}
              </button>
            </div>
          </form>

          {periodValidationError ? (
            <StatusMessage tone="error">{periodValidationError}</StatusMessage>
          ) : null}

          <ListLoadState
            loading={detailLoading && !statement}
            loadingMessage={t("accountStatement.detailLoading")}
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
                    <dt>{t("accountStatement.field.opening")}</dt>
                    <dd>
                      {formatMoney(statement.openingDebit, currency)} /{" "}
                      {formatMoney(statement.openingCredit, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("accountStatement.field.period")}</dt>
                    <dd>
                      {formatMoney(statement.periodDebit, currency)} /{" "}
                      {formatMoney(statement.periodCredit, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("accountStatement.field.closing")}</dt>
                    <dd>
                      {formatMoney(statement.closingDebit, currency)} /{" "}
                      {formatMoney(statement.closingCredit, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("accountStatement.field.periodBounds")}</dt>
                    <dd>
                      {formatDate(statement.periodFromUtc)} — {formatDate(statement.periodToUtc)}
                    </dd>
                  </div>
                </dl>
              </div>

              {statement.lines.length === 0 ? (
                <StatusMessage>{t("accountStatement.linesEmpty")}</StatusMessage>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("accountStatement.col.posted")}</th>
                        <th>{t("accountStatement.col.description")}</th>
                        <th>{t("accountStatement.col.debit")}</th>
                        <th>{t("accountStatement.col.credit")}</th>
                        <th>{t("accountStatement.col.runningDc")}</th>
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
                          <td className="cell-wrap">
                            {line.description?.trim() || t("emDash", { ns: "common" })}
                          </td>
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
                                {t("accountStatement.openJournal")}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailLoading ? (
                <StatusMessage>{t("accountStatement.updating")}</StatusMessage>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : (
        <Panel
          title={t("accountStatement.detailTitle")}
          headingId="account-statement-empty-heading"
        >
          <StatusMessage>{t("accountStatement.selectPrompt")}</StatusMessage>
        </Panel>
      )}
    </>
  );
}
