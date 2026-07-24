import { FormEvent, useCallback, useEffect, useState } from "react";
import { AccrualsView } from "./AccrualsView";
import {
  createFinanceWorkspace,
  getConfiguredApiBaseUrl,
  getFinanceWorkspace,
  getHealth,
  type FinanceWorkspace,
  type HealthStatus
} from "./api";
import { DashboardView } from "./DashboardView";
import { InvoicesView } from "./InvoicesView";
import { APP_VIEWS, type AppView } from "./navigation";
import { WorkspaceView } from "./WorkspaceView";

const WORKSPACE_STORAGE_KEY = "vectorflow.finance.demo.workspaceId";

function createGuid(): string {
  return crypto.randomUUID();
}

export default function App() {
  const [view, setView] = useState<AppView>("dashboard");

  const [apiBaseUrl] = useState(() => {
    try {
      return getConfiguredApiBaseUrl();
    } catch (error) {
      return error instanceof Error ? error.message : "API URL is not configured.";
    }
  });

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [workspaceIdInput, setWorkspaceIdInput] = useState(
    () => localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? ""
  );
  const [workspace, setWorkspace] = useState<FinanceWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);

    try {
      const status = await getHealth();
      setHealth(status);
    } catch (error) {
      setHealth(null);
      setHealthError(error instanceof Error ? error.message : "Не вдалося отримати стан API.");
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async (workspaceId: string) => {
    const trimmed = workspaceId.trim();
    if (!trimmed) {
      setWorkspaceError("Вкажіть ідентифікатор фінансового робочого простору.");
      return;
    }

    setWorkspaceBusy(true);
    setWorkspaceError(null);

    try {
      const loaded = await getFinanceWorkspace(trimmed);
      setWorkspace(loaded);
      setWorkspaceIdInput(loaded.id);
      localStorage.setItem(WORKSPACE_STORAGE_KEY, loaded.id);
    } catch (error) {
      setWorkspace(null);
      setWorkspaceError(
        error instanceof Error ? error.message : "Не вдалося завантажити робочий простір."
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved) {
      void loadWorkspace(saved);
    }
  }, [loadWorkspace]);

  function navigate(next: AppView) {
    if ((next === "invoices" || next === "accruals") && !workspace) {
      setView("workspace");
      return;
    }

    setView(next);
  }

  async function handleLoadWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadWorkspace(workspaceIdInput);
  }

  async function handleCreateWorkspace() {
    setWorkspaceBusy(true);
    setWorkspaceError(null);

    try {
      const created = await createFinanceWorkspace({
        platformOrganizationId: createGuid(),
        platformWorkspaceId: createGuid(),
        name: "Демонстраційний простір",
        defaultCurrency: "UAH"
      });

      setWorkspace(created);
      setWorkspaceIdInput(created.id);
      localStorage.setItem(WORKSPACE_STORAGE_KEY, created.id);
    } catch (error) {
      setWorkspace(null);
      setWorkspaceError(
        error instanceof Error ? error.message : "Не вдалося створити робочий простір."
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function handleRetryWorkspace() {
    const trimmed = workspaceIdInput.trim();
    if (trimmed) {
      void loadWorkspace(trimmed);
      return;
    }

    void handleCreateWorkspace();
  }

  return (
    <main className="shell">
      <nav className="app-nav" aria-label="Основна навігація">
        {APP_VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "app-nav-item is-active" : "app-nav-item"}
            onClick={() => navigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === "dashboard" ? (
        <DashboardView
          apiBaseUrl={apiBaseUrl}
          health={health}
          healthLoading={healthLoading}
          healthError={healthError}
          workspace={workspace}
          workspaceBusy={workspaceBusy}
          workspaceError={workspaceError}
          onRefreshHealth={() => void refreshHealth()}
          onCreateWorkspace={() => void handleCreateWorkspace()}
          onRetryWorkspace={handleRetryWorkspace}
          onNavigate={navigate}
        />
      ) : null}

      {view === "workspace" ? (
        <WorkspaceView
          workspaceIdInput={workspaceIdInput}
          workspace={workspace}
          workspaceBusy={workspaceBusy}
          workspaceError={workspaceError}
          onWorkspaceIdChange={setWorkspaceIdInput}
          onLoadWorkspace={(event) => void handleLoadWorkspace(event)}
          onCreateWorkspace={() => void handleCreateWorkspace()}
        />
      ) : null}

      {view === "invoices" ? <InvoicesView workspace={workspace} /> : null}

      {view === "accruals" ? <AccrualsView workspace={workspace} /> : null}
    </main>
  );
}
