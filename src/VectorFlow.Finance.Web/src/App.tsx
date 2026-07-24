import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  createFinanceWorkspace,
  createInvoice,
  getConfiguredApiBaseUrl,
  getFinanceWorkspace,
  getHealth,
  listInvoicesPaged,
  type FinanceWorkspace,
  type HealthStatus,
  type Invoice
} from "./api";

const WORKSPACE_STORAGE_KEY = "vectorflow.finance.demo.workspaceId";

function createGuid(): string {
  return crypto.randomUUID();
}

function formatMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("uk-UA");
}

export default function App() {
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

  const loadWorkspace = useCallback(
    async (workspaceId: string) => {
      const trimmed = workspaceId.trim();
      if (!trimmed) {
        setWorkspaceError("Вкажіть ідентифікатор фінансового робочого простору.");
        return;
      }

      setWorkspaceBusy(true);
      setWorkspaceError(null);
      setCreateInvoiceError(null);

      try {
        const loaded = await getFinanceWorkspace(trimmed);
        setWorkspace(loaded);
        setWorkspaceIdInput(loaded.id);
        localStorage.setItem(WORKSPACE_STORAGE_KEY, loaded.id);
        await loadInvoices(loaded.id);
      } catch (error) {
        setWorkspace(null);
        setInvoices([]);
        setInvoiceTotalCount(0);
        setWorkspaceError(
          error instanceof Error ? error.message : "Не вдалося завантажити робочий простір."
        );
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [loadInvoices]
  );

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved) {
      void loadWorkspace(saved);
    }
  }, [loadWorkspace]);

  async function handleLoadWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadWorkspace(workspaceIdInput);
  }

  async function handleCreateWorkspace() {
    setWorkspaceBusy(true);
    setWorkspaceError(null);
    setCreateInvoiceError(null);

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
      await loadInvoices(created.id);
    } catch (error) {
      setWorkspace(null);
      setInvoices([]);
      setInvoiceTotalCount(0);
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

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">VectorFlow Finance</p>
        <h1>Фінанси</h1>
        <p className="lede">
          Браузерна оболонка підключена до реального Finance API. Створіть робочий простір і
          перегляньте рахунки з живої бази.
        </p>
      </header>

      <section className="panel" aria-labelledby="api-status-heading">
        <div className="panel-header">
          <h2 id="api-status-heading">Стан API</h2>
          <button type="button" onClick={() => void refreshHealth()} disabled={healthLoading}>
            Оновити
          </button>
        </div>
        <p className="meta">Базовий URL: {apiBaseUrl}</p>
        {healthLoading ? <p className="state">Перевірка з&apos;єднання…</p> : null}
        {healthError ? <p className="state state-error">{healthError}</p> : null}
        {health ? (
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
      </section>

      <section className="panel" aria-labelledby="workspace-heading">
        <div className="panel-header">
          <h2 id="workspace-heading">Робочий простір</h2>
          <button type="button" onClick={() => void handleCreateWorkspace()} disabled={workspaceBusy}>
            Створити новий
          </button>
        </div>
        <form className="row-form" onSubmit={(event) => void handleLoadWorkspace(event)}>
          <label>
            Ідентифікатор
            <input
              value={workspaceIdInput}
              onChange={(event) => setWorkspaceIdInput(event.target.value)}
              placeholder="GUID фінансового робочого простору"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" disabled={workspaceBusy}>
            Завантажити
          </button>
        </form>
        {workspaceBusy ? <p className="state">Завантаження робочого простору…</p> : null}
        {workspaceError ? <p className="state state-error">{workspaceError}</p> : null}
        {workspace ? (
          <dl className="facts">
            <div>
              <dt>Назва</dt>
              <dd>{workspace.name}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>{workspace.status}</dd>
            </div>
            <div>
              <dt>Валюта</dt>
              <dd>{workspace.defaultCurrency}</dd>
            </div>
            <div>
              <dt>Id</dt>
              <dd className="mono">{workspace.id}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="invoices-heading">
        <div className="panel-header">
          <h2 id="invoices-heading">Рахунки</h2>
          <button
            type="button"
            onClick={() => workspace && void loadInvoices(workspace.id)}
            disabled={!workspace || invoicesLoading}
          >
            Оновити список
          </button>
        </div>

        {!workspace ? (
          <p className="state">Оберіть робочий простір, щоб побачити рахунки з API.</p>
        ) : null}

        {workspace ? (
          <form className="create-form" onSubmit={(event) => void handleCreateInvoice(event)}>
            <label>
              Номер документа
              <input
                value={documentNumber}
                onChange={(event) => setDocumentNumber(event.target.value)}
                placeholder="INV-20260724-001"
                required
              />
            </label>
            <label>
              Контрагент
              <input
                value={counterpartyReference}
                onChange={(event) => setCounterpartyReference(event.target.value)}
                required
              />
            </label>
            <label>
              Валюта
              <input
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                maxLength={3}
                required
              />
            </label>
            <button type="submit" disabled={createInvoiceBusy}>
              Створити чернетку
            </button>
          </form>
        ) : null}

        {createInvoiceError ? <p className="state state-error">{createInvoiceError}</p> : null}
        {invoicesLoading ? <p className="state">Завантаження рахунків…</p> : null}
        {invoicesError ? <p className="state state-error">{invoicesError}</p> : null}
        {!invoicesLoading && !invoicesError && workspace && invoices.length === 0 ? (
          <p className="state">Рахунків ще немає. Створіть чернетку через форму вище.</p>
        ) : null}

        {invoices.length > 0 ? (
          <>
            <p className="meta">Показано {invoices.length} з {invoiceTotalCount}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Статус</th>
                    <th>Контрагент</th>
                    <th>Сума</th>
                    <th>Створено</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.documentNumber}</td>
                      <td>{invoice.status}</td>
                      <td>{invoice.counterpartyReference}</td>
                      <td>{formatMoney(invoice.totalAmount, invoice.currency)}</td>
                      <td>{formatDate(invoice.createdAtUtc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
