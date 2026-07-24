import { useCallback, useEffect, useRef, useState } from "react";
import { listAccrualsPaged, listInvoicesPaged, type FinanceWorkspace } from "./api";
import { ListLoadState } from "./components/ListLoadState";
import { Panel } from "./components/Panel";
import type { AppView } from "./navigation";

export type WorkspaceTotals = {
  invoiceCount: number;
  accrualCount: number;
};

type WorkspaceSummaryProps = {
  workspace: FinanceWorkspace;
  onNavigate: (view: AppView) => void;
  onTotalsChange?: (totals: WorkspaceTotals | null) => void;
};

export function WorkspaceSummary({
  workspace,
  onNavigate,
  onTotalsChange
}: WorkspaceSummaryProps) {
  const [totals, setTotals] = useState<WorkspaceTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadTotals = useCallback(
    async (workspaceId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeq.current;

      setLoading(true);
      setError(null);
      onTotalsChange?.(null);

      try {
        const [invoices, accruals] = await Promise.all([
          listInvoicesPaged(workspaceId, { page: 1, pageSize: 1 }, controller.signal),
          listAccrualsPaged(workspaceId, { page: 1, pageSize: 1 }, controller.signal)
        ]);

        if (seq !== requestSeq.current) {
          return;
        }

        const nextTotals = {
          invoiceCount: invoices.totalCount,
          accrualCount: accruals.totalCount
        };
        setTotals(nextTotals);
        onTotalsChange?.(nextTotals);
      } catch (loadError) {
        if (seq !== requestSeq.current) {
          return;
        }

        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setTotals(null);
        onTotalsChange?.(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не вдалося завантажити підсумки workspace."
        );
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [onTotalsChange]
  );

  useEffect(() => {
    void loadTotals(workspace.id);

    return () => {
      abortRef.current?.abort();
      onTotalsChange?.(null);
    };
  }, [workspace.id, loadTotals, onTotalsChange]);

  return (
    <Panel
      title="Підсумки workspace"
      headingId="workspace-summary-heading"
      actions={
        <button
          type="button"
          onClick={() => void loadTotals(workspace.id)}
          disabled={loading}
        >
          Оновити
        </button>
      }
    >
      <p className="meta">
        {workspace.name} · {workspace.status} · {workspace.defaultCurrency}
      </p>

      <ListLoadState
        loading={loading}
        loadingMessage="Завантаження підсумків…"
        error={error}
        onRetry={() => void loadTotals(workspace.id)}
        retryDisabled={loading}
        empty={!totals}
        emptyMessage="Підсумки ще не отримано. Натисніть «Спробувати знову»."
      />

      {!loading && !error && totals ? (
        <div className="metrics" aria-label="Підсумки документів">
          <button
            type="button"
            className="metric"
            onClick={() => onNavigate("invoices")}
          >
            <span className="metric-value">{totals.invoiceCount}</span>
            <span className="metric-label">Рахунків</span>
          </button>
          <button
            type="button"
            className="metric"
            onClick={() => onNavigate("accruals")}
          >
            <span className="metric-value">{totals.accrualCount}</span>
            <span className="metric-label">Нарахувань</span>
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
