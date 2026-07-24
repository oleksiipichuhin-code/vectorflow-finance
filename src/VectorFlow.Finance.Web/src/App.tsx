import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
import {
  buildUrlSearch,
  createEmptyDiscovery,
  draftInvoicesDiscovery,
  parseUrlSearch,
  type AppUrlState,
  type ListDiscovery
} from "./urlState";
import { InvoicesView } from "./InvoicesView";
import { APP_VIEWS, type AppView } from "./navigation";
import { WorkspaceContextBar } from "./WorkspaceContextBar";
import { WorkspaceView } from "./WorkspaceView";

const WORKSPACE_STORAGE_KEY = "vectorflow.finance.demo.workspaceId";

function createGuid(): string {
  return crypto.randomUUID();
}

function readInitialUrlState(): AppUrlState {
  return parseUrlSearch(window.location.search);
}

export default function App() {
  const initialUrl = useRef(readInitialUrlState()).current;

  const [view, setView] = useState<AppView>(initialUrl.view);
  const [discovery, setDiscovery] = useState<ListDiscovery>(initialUrl.discovery);
  const [listEpoch, setListEpoch] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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
    () => initialUrl.workspaceId ?? localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? ""
  );
  const [workspace, setWorkspace] = useState<FinanceWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);

  const skipUrlWrite = useRef(true);

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
    const fromUrl = initialUrl.workspaceId;
    const saved = fromUrl ?? localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved) {
      void loadWorkspace(saved);
    }
  }, [initialUrl.workspaceId, loadWorkspace]);

  useEffect(() => {
    if (skipUrlWrite.current) {
      skipUrlWrite.current = false;
      const expected = buildUrlSearch({
        view: initialUrl.view,
        workspaceId: initialUrl.workspaceId,
        discovery: initialUrl.discovery
      });
      if (window.location.search !== expected) {
        window.history.replaceState(null, "", `${window.location.pathname}${expected}`);
      }
      return;
    }

    const next: AppUrlState = {
      view,
      workspaceId: workspace?.id ?? null,
      discovery
    };
    const search = buildUrlSearch(next);
    const nextUrl = `${window.location.pathname}${search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== nextUrl) {
      window.history.pushState(null, "", nextUrl);
    }
  }, [view, workspace?.id, discovery, initialUrl]);

  useEffect(() => {
    function onPopState() {
      const parsed = parseUrlSearch(window.location.search);
      skipUrlWrite.current = true;
      setView(parsed.view);
      setDiscovery(parsed.discovery);
      setListEpoch((value) => value + 1);

      if (parsed.workspaceId) {
        setWorkspaceIdInput(parsed.workspaceId);
        if (workspace?.id !== parsed.workspaceId) {
          void loadWorkspace(parsed.workspaceId);
        }
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [loadWorkspace, workspace?.id]);

  function navigate(next: AppView) {
    if ((next === "invoices" || next === "accruals") && !workspace) {
      setView("workspace");
      setDiscovery(createEmptyDiscovery());
      return;
    }

    setView(next);
    if (next !== "invoices" && next !== "accruals") {
      setDiscovery((current) => ({
        ...current,
        page: 1
      }));
    }
  }

  const handleInvoiceDiscoveryChange = useCallback(
    (page: number, filters: ListDiscovery["invoiceFilters"]) => {
      setDiscovery((current) => ({
        ...current,
        page,
        invoiceFilters: filters
      }));
    },
    []
  );

  const handleAccrualDiscoveryChange = useCallback(
    (page: number, filters: ListDiscovery["accrualFilters"]) => {
      setDiscovery((current) => ({
        ...current,
        page,
        accrualFilters: filters
      }));
    },
    []
  );

  const showDraftInvoices = useCallback(() => {
    if (!workspace) {
      setView("workspace");
      return;
    }

    setDiscovery(draftInvoicesDiscovery());
    setListEpoch((value) => value + 1);
    setView("invoices");
  }, [workspace]);

  const handleCopyLink = useCallback(async () => {
    const search = buildUrlSearch({
      view,
      workspaceId: workspace?.id ?? null,
      discovery
    });
    const href = `${window.location.origin}${window.location.pathname}${search}`;

    try {
      await navigator.clipboard.writeText(href);
      setCopyFeedback("Посилання скопійовано");
    } catch {
      setCopyFeedback("Не вдалося скопіювати посилання");
    }

    window.setTimeout(() => setCopyFeedback(null), 2500);
  }, [view, workspace?.id, discovery]);

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

      <WorkspaceContextBar
        workspace={workspace}
        workspaceBusy={workspaceBusy}
        copyFeedback={copyFeedback}
        onOpenWorkspace={() => navigate("workspace")}
        onCopyLink={() => void handleCopyLink()}
        onShowDraftInvoices={showDraftInvoices}
      />

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
          onShowDraftInvoices={showDraftInvoices}
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

      {view === "invoices" ? (
        <InvoicesView
          key={`invoices-${listEpoch}`}
          workspace={workspace}
          initialPage={discovery.page}
          initialFilters={discovery.invoiceFilters}
          onDiscoveryChange={handleInvoiceDiscoveryChange}
          onShowDraftInvoices={showDraftInvoices}
        />
      ) : null}

      {view === "accruals" ? (
        <AccrualsView
          key={`accruals-${listEpoch}`}
          workspace={workspace}
          initialPage={discovery.page}
          initialFilters={discovery.accrualFilters}
          onDiscoveryChange={handleAccrualDiscoveryChange}
        />
      ) : null}
    </main>
  );
}
