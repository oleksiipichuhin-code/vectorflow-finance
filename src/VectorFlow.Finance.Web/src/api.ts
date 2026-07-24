export type HealthStatus = {
  product: string;
  status: string;
  phase: string;
};

export type FinanceWorkspace = {
  id: string;
  platformOrganizationId: string;
  platformWorkspaceId: string;
  name: string;
  defaultCurrency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Invoice = {
  id: string;
  financeWorkspaceId: string;
  documentNumber: string;
  counterpartyReference: string;
  currency: string;
  status: string;
  dueDateUtc: string | null;
  totalAmount: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  issuedAtUtc: string | null;
};

export type InvoicePage = {
  items: Invoice[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export type ApiErrorBody = {
  error?: string;
  message?: string;
};

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_FINANCE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (import.meta.env.DEV) {
    return "http://localhost:5080";
  }

  throw new Error("VITE_FINANCE_API_BASE_URL is not configured.");
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.message) {
      return body.message;
    }

    if (body.error) {
      return body.error;
    }
  } catch {
    // Fall through to status text.
  }

  return response.statusText || `HTTP ${response.status}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getConfiguredApiBaseUrl(): string {
  return apiBaseUrl();
}

export function getHealth(): Promise<HealthStatus> {
  return requestJson<HealthStatus>("/health");
}

export function getFinanceWorkspace(workspaceId: string): Promise<FinanceWorkspace> {
  return requestJson<FinanceWorkspace>(`/api/finance-workspaces/${workspaceId}`);
}

export function createFinanceWorkspace(input: {
  platformOrganizationId: string;
  platformWorkspaceId: string;
  name: string;
  defaultCurrency: string;
}): Promise<FinanceWorkspace> {
  return requestJson<FinanceWorkspace>("/api/finance-workspaces", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function listInvoicesPaged(
  workspaceId: string,
  page = 1,
  pageSize = 20
): Promise<InvoicePage> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  return requestJson<InvoicePage>(
    `/api/finance-workspaces/${workspaceId}/invoices?${params.toString()}`
  );
}

export function createInvoice(
  workspaceId: string,
  input: {
    documentNumber: string;
    counterpartyReference: string;
    currency: string;
  }
): Promise<Invoice> {
  return requestJson<Invoice>(`/api/finance-workspaces/${workspaceId}/invoices`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
