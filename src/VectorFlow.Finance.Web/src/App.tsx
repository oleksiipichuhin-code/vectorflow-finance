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
  issuedInvoicesDiscovery,
  overdueIssuedInvoicesDiscovery,
  parseUrlSearch,
  type AppUrlState,
  type JournalStatusFilter,
  type ListDiscovery
} from "./urlState";
import type { InvoiceQueueMode } from "./invoiceListQuery";
import type { AgingBucketFilter } from "./invoiceCollections";
import type { PromiseGroupFilter } from "./promiseToPay";
import type { WorkbenchSortMode } from "./collectionWorkbench";
import type { CollectionActivityEventTypeFilter } from "./collectionCaseHistory";
import type { CollectionPanelMode } from "./urlState";
import { isPromisePanel } from "./urlState";
import { InvoicesView } from "./InvoicesView";
import { JournalsView } from "./JournalsView";
import { TrialBalanceView } from "./TrialBalanceView";
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

export type DetailIdChangeOptions = {
  /** Use replaceState instead of pushState (404 / normalize recovery). */
  replace?: boolean;
};

export default function App() {
  const initialUrl = useRef(readInitialUrlState()).current;

  const [view, setView] = useState<AppView>(initialUrl.view);
  const [discovery, setDiscovery] = useState<ListDiscovery>(initialUrl.discovery);
  const [accrualId, setAccrualId] = useState<string | null>(initialUrl.accrualId);
  const [invoiceId, setInvoiceId] = useState<string | null>(initialUrl.invoiceId);
  const [journalEntryId, setJournalEntryId] = useState<string | null>(
    initialUrl.journalEntryId
  );
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
  /** First URL sync may normalize the entry URL; later skips (popstate) must not rewrite history. */
  const isFirstUrlSync = useRef(true);
  const urlWriteModeRef = useRef<"push" | "replace">("push");

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
      // Only the initial mount may normalize the landed URL. Subsequent skips come from
      // popstate; rewriting to initialUrl would destroy Back/Forward (overdue queue ↔ detail).
      if (isFirstUrlSync.current) {
        isFirstUrlSync.current = false;
        const expected = buildUrlSearch({
          view: initialUrl.view,
          workspaceId: initialUrl.workspaceId,
          accrualId: initialUrl.accrualId,
          invoiceId: initialUrl.invoiceId,
          journalEntryId: initialUrl.journalEntryId,
          discovery: initialUrl.discovery
        });
        if (window.location.search !== expected) {
          window.history.replaceState(null, "", `${window.location.pathname}${expected}`);
        }
      }
      return;
    }

    const next: AppUrlState = {
      view,
      workspaceId: workspace?.id ?? null,
      accrualId: view === "accruals" ? accrualId : null,
      invoiceId: view === "invoices" ? invoiceId : null,
      journalEntryId: view === "journals" ? journalEntryId : null,
      discovery
    };
    const search = buildUrlSearch(next);
    const nextUrl = `${window.location.pathname}${search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== nextUrl) {
      if (urlWriteModeRef.current === "replace") {
        window.history.replaceState(null, "", nextUrl);
      } else {
        window.history.pushState(null, "", nextUrl);
      }
    }
    urlWriteModeRef.current = "push";
  }, [view, workspace?.id, discovery, accrualId, invoiceId, journalEntryId, initialUrl]);

  useEffect(() => {
    function onPopState() {
      const parsed = parseUrlSearch(window.location.search);
      skipUrlWrite.current = true;
      setView(parsed.view);
      setDiscovery(parsed.discovery);
      setAccrualId(parsed.view === "accruals" ? parsed.accrualId : null);
      setInvoiceId(parsed.view === "invoices" ? parsed.invoiceId : null);
      setJournalEntryId(parsed.view === "journals" ? parsed.journalEntryId : null);
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
    if (
      (next === "invoices" ||
        next === "accruals" ||
        next === "journals" ||
        next === "trial-balance") &&
      !workspace
    ) {
      setView("workspace");
      setDiscovery(createEmptyDiscovery());
      setAccrualId(null);
      setInvoiceId(null);
      setJournalEntryId(null);
      return;
    }

    setView(next);
    if (next !== "accruals") {
      setAccrualId(null);
    }
    if (next !== "invoices") {
      setInvoiceId(null);
    }
    if (next !== "journals") {
      setJournalEntryId(null);
    }
    if (
      next !== "invoices" &&
      next !== "accruals" &&
      next !== "journals"
    ) {
      setDiscovery((current) => ({
        ...current,
        page: 1
      }));
    }
  }

  const handleInvoiceDiscoveryChange = useCallback(
    (
      page: number,
      filters: ListDiscovery["invoiceFilters"],
      invoiceQueue: InvoiceQueueMode = "",
      agingBucket: AgingBucketFilter = "",
      collectionPanel: CollectionPanelMode = "",
      promiseGroup: PromiseGroupFilter = "",
      promiseSearch: string = "",
      workbenchSort: WorkbenchSortMode = "priority",
      workbenchHideCompleted: boolean = false,
      workbenchSection: ListDiscovery["workbenchSection"] = "",
      caseHistoryOpen: boolean = false,
      caseHistoryType: CollectionActivityEventTypeFilter = "",
      caseHistorySearch: string = "",
      caseHistoryExpanded: boolean = false,
      queueHideSettled: boolean = true
    ) => {
      const overdue = invoiceQueue === "overdue";
      const panel: CollectionPanelMode =
        overdue && isPromisePanel(collectionPanel) ? collectionPanel : "";
      setDiscovery((current) => ({
        ...current,
        page,
        invoiceFilters: filters,
        invoiceQueue,
        agingBucket: overdue ? agingBucket : "",
        collectionPanel: panel,
        promiseGroup: isPromisePanel(panel) ? promiseGroup : "",
        promiseSearch: isPromisePanel(panel) ? promiseSearch.trim() : "",
        workbenchSection: panel === "workbench" ? workbenchSection : "",
        workbenchSort: panel === "workbench" ? workbenchSort : "priority",
        workbenchHideCompleted: panel === "workbench" ? workbenchHideCompleted : false,
        queueHideSettled: overdue ? queueHideSettled : true,
        caseHistoryOpen: overdue ? caseHistoryOpen : false,
        caseHistoryType: overdue && caseHistoryOpen ? caseHistoryType : "",
        caseHistorySearch: overdue && caseHistoryOpen ? caseHistorySearch.trim() : "",
        caseHistoryExpanded: overdue && caseHistoryOpen ? caseHistoryExpanded : false
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

  const handleJournalDiscoveryChange = useCallback(
    (page: number, status: JournalStatusFilter) => {
      setDiscovery((current) => ({
        ...current,
        page,
        journalStatus: status
      }));
    },
    []
  );

  const handleAccrualIdChange = useCallback(
    (nextAccrualId: string | null, options?: DetailIdChangeOptions) => {
      if (options?.replace) {
        urlWriteModeRef.current = "replace";
      }
      setAccrualId(nextAccrualId);
    },
    []
  );

  const handleInvoiceIdChange = useCallback(
    (nextInvoiceId: string | null, options?: DetailIdChangeOptions) => {
      if (options?.replace) {
        urlWriteModeRef.current = "replace";
      }
      setInvoiceId(nextInvoiceId);
    },
    []
  );

  const handleJournalEntryIdChange = useCallback(
    (nextJournalEntryId: string | null, options?: DetailIdChangeOptions) => {
      if (options?.replace) {
        urlWriteModeRef.current = "replace";
      }
      setJournalEntryId(nextJournalEntryId);
    },
    []
  );

  const showDraftInvoices = useCallback(() => {
    if (!workspace) {
      setView("workspace");
      return;
    }

    setDiscovery(draftInvoicesDiscovery());
    setAccrualId(null);
    setInvoiceId(null);
    setJournalEntryId(null);
    setListEpoch((value) => value + 1);
    setView("invoices");
  }, [workspace]);

  const showIssuedInvoices = useCallback(() => {
    if (!workspace) {
      setView("workspace");
      return;
    }

    setDiscovery(issuedInvoicesDiscovery());
    setAccrualId(null);
    setInvoiceId(null);
    setJournalEntryId(null);
    setListEpoch((value) => value + 1);
    setView("invoices");
  }, [workspace]);

  const showOverdueIssuedInvoices = useCallback(() => {
    if (!workspace) {
      setView("workspace");
      return;
    }

    setDiscovery(overdueIssuedInvoicesDiscovery());
    setAccrualId(null);
    setInvoiceId(null);
    setJournalEntryId(null);
    setListEpoch((value) => value + 1);
    setView("invoices");
  }, [workspace]);

  const openAccrualDetail = useCallback(
    (nextAccrualId: string) => {
      if (!workspace) {
        setView("workspace");
        return;
      }

      setDiscovery(createEmptyDiscovery());
      setInvoiceId(null);
      setJournalEntryId(null);
      setAccrualId(nextAccrualId);
      setListEpoch((value) => value + 1);
      setView("accruals");
    },
    [workspace]
  );

  const openInvoiceDetail = useCallback(
    (nextInvoiceId: string) => {
      if (!workspace) {
        setView("workspace");
        return;
      }

      setDiscovery(createEmptyDiscovery());
      setAccrualId(null);
      setJournalEntryId(null);
      setInvoiceId(nextInvoiceId);
      setListEpoch((value) => value + 1);
      setView("invoices");
    },
    [workspace]
  );

  const handleCopyLink = useCallback(async () => {
    const search = buildUrlSearch({
      view,
      workspaceId: workspace?.id ?? null,
      accrualId: view === "accruals" ? accrualId : null,
      invoiceId: view === "invoices" ? invoiceId : null,
      journalEntryId: view === "journals" ? journalEntryId : null,
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
  }, [view, workspace?.id, discovery, accrualId, invoiceId, journalEntryId]);

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
        onShowIssuedInvoices={showIssuedInvoices}
        onShowOverdueIssuedInvoices={showOverdueIssuedInvoices}
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
          onShowIssuedInvoices={showIssuedInvoices}
          onShowOverdueIssuedInvoices={showOverdueIssuedInvoices}
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
          initialInvoiceQueue={discovery.invoiceQueue}
          initialAgingBucket={discovery.agingBucket}
          initialCollectionPanel={discovery.collectionPanel}
          initialPromiseGroup={discovery.promiseGroup}
          initialPromiseSearch={discovery.promiseSearch}
          initialWorkbenchSection={discovery.workbenchSection}
          initialWorkbenchSort={discovery.workbenchSort}
          initialWorkbenchHideCompleted={discovery.workbenchHideCompleted}
          initialQueueHideSettled={discovery.queueHideSettled}
          initialCaseHistoryOpen={discovery.caseHistoryOpen}
          initialCaseHistoryType={discovery.caseHistoryType}
          initialCaseHistorySearch={discovery.caseHistorySearch}
          initialCaseHistoryExpanded={discovery.caseHistoryExpanded}
          selectedInvoiceId={invoiceId}
          onDiscoveryChange={handleInvoiceDiscoveryChange}
          onSelectedInvoiceIdChange={handleInvoiceIdChange}
          onShowDraftInvoices={showDraftInvoices}
          onShowIssuedInvoices={showIssuedInvoices}
          onShowOverdueIssuedInvoices={showOverdueIssuedInvoices}
          onOpenAccrual={openAccrualDetail}
        />
      ) : null}

      {view === "accruals" ? (
        <AccrualsView
          key={`accruals-${listEpoch}`}
          workspace={workspace}
          initialPage={discovery.page}
          initialFilters={discovery.accrualFilters}
          selectedAccrualId={accrualId}
          onDiscoveryChange={handleAccrualDiscoveryChange}
          onSelectedAccrualIdChange={handleAccrualIdChange}
          onOpenInvoice={openInvoiceDetail}
        />
      ) : null}

      {view === "journals" ? (
        <JournalsView
          key={`journals-${listEpoch}`}
          workspace={workspace}
          initialPage={discovery.page}
          initialStatus={discovery.journalStatus}
          selectedJournalEntryId={journalEntryId}
          onDiscoveryChange={handleJournalDiscoveryChange}
          onSelectedJournalEntryIdChange={handleJournalEntryIdChange}
        />
      ) : null}

      {view === "trial-balance" ? <TrialBalanceView workspace={workspace} /> : null}
    </main>
  );
}
