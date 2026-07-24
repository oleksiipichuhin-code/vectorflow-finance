import { useCallback, useState } from "react";
import { ListLoadState } from "./components/ListLoadState";
import { Panel, StatusMessage } from "./components/Panel";
import type { FinanceWorkspace, HealthStatus } from "./api";
import type { AppView } from "./navigation";
import { WorkspaceSummary, type WorkspaceTotals } from "./WorkspaceSummary";

type DashboardViewProps = {
  apiBaseUrl: string;
  health: HealthStatus | null;
  healthLoading: boolean;
  healthError: string | null;
  workspace: FinanceWorkspace | null;
  workspaceBusy: boolean;
  workspaceError: string | null;
  onRefreshHealth: () => void;
  onCreateWorkspace: () => void;
  onRetryWorkspace: () => void;
  onNavigate: (view: AppView) => void;
  onShowDraftInvoices: () => void;
};

function invoiceCardCopy(workspace: FinanceWorkspace | null, totals: WorkspaceTotals | null): string {
  if (!workspace) {
    return "Список рахунків обраного workspace";
  }

  if (!totals) {
    return "Підрахунок рахунків…";
  }

  const count = totals.invoiceCount;
  if (count === 1) {
    return "1 рахунок у workspace";
  }

  return `${count} рахунків у workspace`;
}

function accrualCardCopy(workspace: FinanceWorkspace | null, totals: WorkspaceTotals | null): string {
  if (!workspace) {
    return "Список нарахувань обраного workspace";
  }

  if (!totals) {
    return "Підрахунок нарахувань…";
  }

  const count = totals.accrualCount;
  if (count === 1) {
    return "1 нарахування у workspace";
  }

  return `${count} нарахувань у workspace`;
}

export function DashboardView({
  apiBaseUrl,
  health,
  healthLoading,
  healthError,
  workspace,
  workspaceBusy,
  workspaceError,
  onRefreshHealth,
  onCreateWorkspace,
  onRetryWorkspace,
  onNavigate,
  onShowDraftInvoices
}: DashboardViewProps) {
  const [totals, setTotals] = useState<WorkspaceTotals | null>(null);
  const handleTotalsChange = useCallback((next: WorkspaceTotals | null) => {
    setTotals(next);
  }, []);

  return (
    <>
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Dashboard</h1>
        <p className="lede">
          Огляд стану Finance API та перехід до робочого простору, рахунків і нарахувань.
        </p>
      </header>

      <Panel
        title="Стан API"
        headingId="api-status-heading"
        actions={
          <button type="button" onClick={onRefreshHealth} disabled={healthLoading}>
            Оновити
          </button>
        }
      >
        <p className="meta">Базовий URL: {apiBaseUrl}</p>
        <ListLoadState
          loading={healthLoading}
          loadingMessage="Перевірка з'єднання…"
          error={healthError}
          onRetry={onRefreshHealth}
          retryDisabled={healthLoading}
          empty={!health}
          emptyMessage="Стан API ще не отримано. Натисніть «Спробувати знову»."
        />
        {!healthLoading && !healthError && health ? (
          <dl className="facts">
            <div>
              <dt>Продукт</dt>
              <dd>{health.product}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{health.status}</dd>
            </div>
            <div>
              <dt>Фаза</dt>
              <dd>{health.phase}</dd>
            </div>
          </dl>
        ) : null}
      </Panel>

      {workspace ? (
        <WorkspaceSummary
          workspace={workspace}
          onNavigate={onNavigate}
          onTotalsChange={handleTotalsChange}
        />
      ) : (
        <Panel title="Старт демонстрації" headingId="demo-start-heading">
          <p className="meta">
            Створіть фінансовий простір одним кроком через реальний API — без ручного введення GUID.
          </p>
          <ListLoadState
            loading={workspaceBusy}
            loadingMessage="Підготовка робочого простору…"
            error={workspaceError}
            onRetry={onRetryWorkspace}
            retryDisabled={workspaceBusy}
            empty={!workspaceBusy && !workspaceError}
            emptyMessage="Після створення стануть доступні підсумки, Invoices і Accruals."
          />
          {!workspaceBusy ? (
            <div className="demo-start-actions">
              <button type="button" onClick={onCreateWorkspace}>
                Створити демонстраційний простір
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => onNavigate("workspace")}
              >
                Завантажити за ідентифікатором
              </button>
            </div>
          ) : null}
        </Panel>
      )}

      <Panel title="Навігація сценарію" headingId="scenario-nav-heading">
        <div className="nav-cards">
          <button type="button" className="nav-card" onClick={() => onNavigate("workspace")}>
            <span className="nav-card-title">Workspace</span>
            <span className="nav-card-copy">
              {workspace
                ? `${workspace.name} · ${workspace.status}`
                : "Завантажте або створіть фінансовий простір"}
            </span>
          </button>
          <button
            type="button"
            className="nav-card"
            onClick={() => onNavigate("invoices")}
            disabled={!workspace}
          >
            <span className="nav-card-title">Invoices</span>
            {workspace && totals ? (
              <span className="nav-card-metric" aria-hidden="true">
                {totals.invoiceCount}
              </span>
            ) : null}
            <span className="nav-card-copy">{invoiceCardCopy(workspace, workspace ? totals : null)}</span>
          </button>
          <button
            type="button"
            className="nav-card"
            onClick={() => onNavigate("accruals")}
            disabled={!workspace}
          >
            <span className="nav-card-title">Accruals</span>
            {workspace && totals ? (
              <span className="nav-card-metric" aria-hidden="true">
                {totals.accrualCount}
              </span>
            ) : null}
            <span className="nav-card-copy">{accrualCardCopy(workspace, workspace ? totals : null)}</span>
          </button>
        </div>
        {workspace ? (
          <div className="list-shortcuts dashboard-list-shortcuts">
            <p className="list-shortcuts-label">Швидкий фільтр</p>
            <div className="list-shortcuts-row">
              <button type="button" className="list-shortcut" onClick={onShowDraftInvoices}>
                Чернетки рахунків
              </button>
            </div>
            <p className="meta">
              Відкриває Invoices з <span className="mono">status=Draft</span> на сторінці 1 і
              зберігає стан у shareable URL.
            </p>
          </div>
        ) : (
          <StatusMessage>
            Спочатку створіть або відкрийте Workspace у блоці «Старт демонстрації».
          </StatusMessage>
        )}
      </Panel>
    </>
  );
}
