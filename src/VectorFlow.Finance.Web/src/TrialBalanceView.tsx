import { useCallback, useEffect, useRef, useState } from "react";
import { getTrialBalance, type FinanceWorkspace, type TrialBalance } from "./api";
import { formatDate, formatMoney } from "./format";
import { formatBalanceSide, trialBalanceBalanceLabel } from "./trialBalance";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";

type TrialBalanceViewProps = {
  workspace: FinanceWorkspace | null;
};

export function TrialBalanceView({ workspace }: TrialBalanceViewProps) {
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async (workspaceId: string) => {
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
          : "Не вдалося завантажити trial balance."
      );
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  }, []);

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
      <Panel title="Trial balance" headingId="trial-balance-heading">
        <StatusMessage>Спочатку відкрийте finance workspace.</StatusMessage>
      </Panel>
    );
  }

  const currency = workspace.defaultCurrency;
  const lines = trialBalance?.lines ?? [];

  return (
    <>
      <header className="hero">
        <p className="eyebrow">General ledger</p>
        <h1>Trial balance</h1>
        <p className="lede">
          Оборотно-сальдова відомість за проведеними ledger postings workspace. Після Post to
          ledger у Journals натисніть «Оновити».
        </p>
      </header>

      <Panel
        title="Trial balance"
        headingId="trial-balance-heading"
        actions={
          <button
            type="button"
            className="button-secondary"
            disabled={loading}
            onClick={() => void load(workspace.id)}
          >
            {loading ? "Завантаження…" : "Оновити"}
          </button>
        }
      >
        <ListLoadState
          loading={loading && !trialBalance}
          loadingMessage="Завантаження trial balance…"
          error={error}
          onRetry={() => void load(workspace.id)}
          retryDisabled={loading}
          empty={!loading && !error && trialBalance != null && lines.length === 0}
          emptyMessage="Немає рахунків у цьому workspace. Створіть рахунки та проведіть journal entry у Journals."
        />

        {!error && trialBalance ? (
          <>
            <div className="queue-banner" role="status">
              <p className="queue-banner-title">
                {trialBalanceBalanceLabel(trialBalance.isBalanced)}
              </p>
              <StatusMessage tone={trialBalance.isBalanced ? "success" : "error"}>
                {trialBalance.isBalanced
                  ? "Total debit дорівнює total credit за ledger postings."
                  : "Total debit і total credit не збігаються — перевірте ledger postings."}
              </StatusMessage>
              <dl className="facts">
                <div>
                  <dt>Total debit</dt>
                  <dd>{formatMoney(trialBalance.totalDebit, currency)}</dd>
                </div>
                <div>
                  <dt>Total credit</dt>
                  <dd>{formatMoney(trialBalance.totalCredit, currency)}</dd>
                </div>
                <div>
                  <dt>Generated</dt>
                  <dd>{formatDate(trialBalance.generatedAtUtc)}</dd>
                </div>
                <div>
                  <dt>Accounts</dt>
                  <dd>{lines.length}</dd>
                </div>
              </dl>
            </div>

            {lines.length > 0 ? (
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
                        <td>{formatBalanceSide(line.balanceSide)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2}>Totals</th>
                      <th>{formatMoney(trialBalance.totalDebit, currency)}</th>
                      <th>{formatMoney(trialBalance.totalCredit, currency)}</th>
                      <th colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}

            {loading ? <StatusMessage>Оновлення…</StatusMessage> : null}
          </>
        ) : null}
      </Panel>
    </>
  );
}
