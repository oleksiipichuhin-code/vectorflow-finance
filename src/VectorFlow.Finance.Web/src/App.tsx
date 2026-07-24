import { FormEvent, useCallback, useEffect, useState } from "react";
import { AccrualsView } from "./AccrualsView";
import {
  createAccrual,
  createFinanceWorkspace,
  createInvoice,
  getConfiguredApiBaseUrl,
  getFinanceWorkspace,
  getHealth,
  listAccrualsPaged,
  listInvoicesPaged,
  type Accrual,
  type FinanceWorkspace,
  type HealthStatus,
  type Invoice
} from "./api";
import { DashboardView } from "./DashboardView";
import { InvoicesView } from "./InvoicesView";
import { APP_VIEWS, type AppView } from "./navigation";
import { WorkspaceView } from "./WorkspaceView";

const WORKSPACE_STORAGE_KEY = "vectorflow.finance.demo.workspaceId";

function createGuid(): string {
  return crypto.randomUUID();
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
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

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [counterpartyReference, setCounterpartyReference] = useState("demo-counterparty");
  const [currency, setCurrency] = useState("UAH");
  const [createInvoiceBusy, setCreateInvoiceBusy] = useState(false);
  const [createInvoiceError, setCreateInvoiceError] = useState<string | null>(null);

  const [accruals, setAccruals] = useState<Accrual[]>([]);
  const [accrualTotalCount, setAccrualTotalCount] = useState(0);
  const [accrualsLoading, setAccrualsLoading] = useState(false);
  const [accrualsError, setAccrualsError] = useState<string | null>(null);
  const [accrualType, setAccrualType] = useState("Revenue");
  const [accrualAmount, setAccrualAmount] = useState("100.00");
  const [accrualCurrency, setAccrualCurrency] = useState("UAH");
  const [accrualRecognitionDate, setAccrualRecognitionDate] = useState(todayDateInputValue);
  const [accrualDescription, setAccrualDescription] = useState("Демонстраційне нарахування");
  const [createAccrualBusy, setCreateAccrualBusy] = useState(false);
  const [createAccrualError, setCreateAccrualError] = useState<string | null>(null);

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

  const loadInvoices = useCallback(async (workspaceId: string) => {
    setInvoicesLoading(true);
    setInvoicesError(null);

    try {
      const page = await listInvoicesPaged(workspaceId, 1, 20);
      setInvoices(page.items);
      setInvoiceTotalCount(page.totalCount);
    } catch (error) {
      setInvoices([]);
      setInvoiceTotalCount(0);
      setInvoicesError(error instanceof Error ? error.message : "Не вдалося завантажити рахунки.");
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

  const loadAccruals = useCallback(async (workspaceId: string) => {
    setAccrualsLoading(true);
    setAccrualsError(null);

    try {
      const page = await listAccrualsPaged(workspaceId, 1, 20);
      setAccruals(page.items);
      setAccrualTotalCount(page.totalCount);
    } catch (error) {
      setAccruals([]);
      setAccrualTotalCount(0);
      setAccrualsError(error instanceof Error ? error.message : "Не вдалося завантажити нарахування.");
    } finally {
      setAccrualsLoading(false);
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
    setCreateInvoiceError(null);
    setCreateAccrualError(null);

    try {
      const loaded = await getFinanceWorkspace(trimmed);
      setWorkspace(loaded);
      setWorkspaceIdInput(loaded.id);
      localStorage.setItem(WORKSPACE_STORAGE_KEY, loaded.id);
      setAccrualCurrency(loaded.defaultCurrency);
      setCurrency(loaded.defaultCurrency);
    } catch (error) {
      setWorkspace(null);
      setInvoices([]);
      setInvoiceTotalCount(0);
      setAccruals([]);
      setAccrualTotalCount(0);
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

  useEffect(() => {
    if (view === "invoices" && workspace) {
      void loadInvoices(workspace.id);
    }
  }, [view, workspace, loadInvoices]);

  useEffect(() => {
    if (view === "accruals" && workspace) {
      void loadAccruals(workspace.id);
    }
  }, [view, workspace, loadAccruals]);

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
    setCreateInvoiceError(null);
    setCreateAccrualError(null);

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
      setDocumentNumber(`INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-001`);
      setCurrency(created.defaultCurrency);
      setAccrualCurrency(created.defaultCurrency);
      setInvoices([]);
      setInvoiceTotalCount(0);
      setAccruals([]);
      setAccrualTotalCount(0);
    } catch (error) {
      setWorkspace(null);
      setInvoices([]);
      setInvoiceTotalCount(0);
      setAccruals([]);
      setAccrualTotalCount(0);
      setWorkspaceError(
        error instanceof Error ? error.message : "Не вдалося створити робочий простір."
      );
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function handleCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) {
      setCreateInvoiceError("Спочатку завантажте або створіть робочий простір.");
      return;
    }

    setCreateInvoiceBusy(true);
    setCreateInvoiceError(null);

    try {
      await createInvoice(workspace.id, {
        documentNumber,
        counterpartyReference,
        currency
      });
      setDocumentNumber("");
      await loadInvoices(workspace.id);
    } catch (error) {
      setCreateInvoiceError(
        error instanceof Error ? error.message : "Не вдалося створити рахунок."
      );
    } finally {
      setCreateInvoiceBusy(false);
    }
  }

  async function handleCreateAccrual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) {
      setCreateAccrualError("Спочатку завантажте або створіть робочий простір.");
      return;
    }

    const amount = Number(accrualAmount.replace(",", "."));
    if (!Number.isFinite(amount)) {
      setCreateAccrualError("Сума має бути числовим значенням.");
      return;
    }

    setCreateAccrualBusy(true);
    setCreateAccrualError(null);

    try {
      await createAccrual(workspace.id, {
        type: accrualType,
        amount,
        currency: accrualCurrency,
        recognitionDateUtc: new Date(`${accrualRecognitionDate}T00:00:00.000Z`).toISOString(),
        description: accrualDescription
      });
      await loadAccruals(workspace.id);
    } catch (error) {
      setCreateAccrualError(
        error instanceof Error ? error.message : "Не вдалося створити нарахування."
      );
    } finally {
      setCreateAccrualBusy(false);
    }
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
          onRefreshHealth={() => void refreshHealth()}
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

      {view === "invoices" ? (
        <InvoicesView
          workspace={workspace}
          invoices={invoices}
          invoiceTotalCount={invoiceTotalCount}
          invoicesLoading={invoicesLoading}
          invoicesError={invoicesError}
          documentNumber={documentNumber}
          counterpartyReference={counterpartyReference}
          currency={currency}
          createInvoiceBusy={createInvoiceBusy}
          createInvoiceError={createInvoiceError}
          onDocumentNumberChange={setDocumentNumber}
          onCounterpartyChange={setCounterpartyReference}
          onCurrencyChange={setCurrency}
          onRefresh={() => workspace && void loadInvoices(workspace.id)}
          onCreateInvoice={(event) => void handleCreateInvoice(event)}
        />
      ) : null}

      {view === "accruals" ? (
        <AccrualsView
          workspace={workspace}
          accruals={accruals}
          accrualTotalCount={accrualTotalCount}
          accrualsLoading={accrualsLoading}
          accrualsError={accrualsError}
          accrualType={accrualType}
          accrualAmount={accrualAmount}
          accrualCurrency={accrualCurrency}
          accrualRecognitionDate={accrualRecognitionDate}
          accrualDescription={accrualDescription}
          createAccrualBusy={createAccrualBusy}
          createAccrualError={createAccrualError}
          onTypeChange={setAccrualType}
          onAmountChange={setAccrualAmount}
          onCurrencyChange={setAccrualCurrency}
          onRecognitionDateChange={setAccrualRecognitionDate}
          onDescriptionChange={setAccrualDescription}
          onRefresh={() => workspace && void loadAccruals(workspace.id)}
          onCreateAccrual={(event) => void handleCreateAccrual(event)}
        />
      ) : null}
    </main>
  );
}
