import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTrialBalance, type FinanceWorkspace, type TrialBalance } from "./api";
import { formatDate, formatMoney } from "./i18n/format.ts";
import { formatBalanceSide, trialBalanceBalanceLabel } from "./trialBalance";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";

type TrialBalanceViewProps = {
  workspace: FinanceWorkspace | null;
};

export function TrialBalanceView({ workspace }: TrialBalanceViewProps) {
  const { t } = useTranslation(["finance", "common"]);
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (workspaceId: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);

      try {
        const next = await getTrialBalance(workspaceId);
        if (seq !== requestSeq.current) {
          return;
        }
        setTrialBalance(next);
      } catch (loadError) {
        if (seq !== requestSeq.current) {
          return;
        }
        setTrialBalance(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : t("trialBalance.listLoadFailed")
        );
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    if (!workspace) {
      setTrialBalance(null);
      setError(null);
      setLoading(false);
      return;
    }

    void load(workspace.id);
    return () => {
      requestSeq.current += 1;
    };
  }, [workspace, load]);

  if (!workspace) {
    return (
      <Panel title={t("trialBalance.title")} headingId="trial-balance-heading">
        <StatusMessage>{t("trialBalance.needWorkspace")}</StatusMessage>
      </Panel>
    );
  }

  const currency = workspace.defaultCurrency;
  const lines = trialBalance?.lines ?? [];

  return (
    <>
      <header className="hero">
        <p className="eyebrow">{t("trialBalance.eyebrow")}</p>
        <h1>{t("trialBalance.title")}</h1>
        <p className="lede">{t("trialBalance.lede")}</p>
      </header>

      <Panel
        title={t("trialBalance.panelTitle")}
        headingId="trial-balance-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={loading}
            onClick={() => void load(workspace.id)}
          >
            {loading ? t("loading", { ns: "common" }) : t("refresh", { ns: "common" })}
          </button>
        }
      >
        <ListLoadState
          loading={loading && !trialBalance}
          loadingMessage={t("trialBalance.listLoading")}
          error={error}
          onRetry={() => void load(workspace.id)}
          retryDisabled={loading}
          empty={!loading && !error && trialBalance != null && lines.length === 0}
          emptyMessage={t("trialBalance.listEmpty")}
        />

        {!error && trialBalance ? (
          <>
            <div className="queue-banner" role="status">
              <p className="queue-banner-title">
                {trialBalanceBalanceLabel(trialBalance.isBalanced, t)}
              </p>
              <StatusMessage tone={trialBalance.isBalanced ? "success" : "error"}>
                {trialBalance.isBalanced
                  ? t("trialBalance.balancedMessage")
                  : t("trialBalance.unbalancedMessage")}
              </StatusMessage>
              <dl className="facts">
                <div>
                  <dt>{t("trialBalance.field.totalDebit")}</dt>
                  <dd>{formatMoney(trialBalance.totalDebit, currency)}</dd>
                </div>
                <div>
                  <dt>{t("trialBalance.field.totalCredit")}</dt>
                  <dd>{formatMoney(trialBalance.totalCredit, currency)}</dd>
                </div>
                <div>
                  <dt>{t("trialBalance.field.generated")}</dt>
                  <dd>{formatDate(trialBalance.generatedAtUtc)}</dd>
                </div>
                <div>
                  <dt>{t("trialBalance.field.accounts")}</dt>
                  <dd>{lines.length}</dd>
                </div>
              </dl>
            </div>

            {lines.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("trialBalance.col.code")}</th>
                      <th>{t("trialBalance.col.name")}</th>
                      <th>{t("trialBalance.col.debit")}</th>
                      <th>{t("trialBalance.col.credit")}</th>
                      <th>{t("trialBalance.col.balance")}</th>
                      <th>{t("trialBalance.col.side")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.accountId} data-row-id={line.accountId}>
                        <td className="mono">{line.accountCode}</td>
                        <td className="cell-wrap">{line.accountName}</td>
                        <td>{formatMoney(line.debitTotal, currency)}</td>
                        <td>{formatMoney(line.creditTotal, currency)}</td>
                        <td>{formatMoney(Math.abs(line.balance), currency)}</td>
                        <td>{formatBalanceSide(line.balanceSide, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>{t("trialBalance.totals")}</th>
                      <th>{formatMoney(trialBalance.totalDebit, currency)}</th>
                      <th>{formatMoney(trialBalance.totalCredit, currency)}</th>
                      <th colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}

            {loading ? <StatusMessage>{t("trialBalance.updating")}</StatusMessage> : null}
          </>
        ) : null}
      </Panel>
    </>
  );
}
