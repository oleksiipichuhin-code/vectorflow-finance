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

export type InvoiceLine = {
  id: string;
  sequence: number;
  description: string | null;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
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
  /** Present on GET-by-id; list payloads may omit or return empty. */
  lines?: InvoiceLine[];
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

/** Narrow typed API failure; `instanceof Error` remains true for existing catch sites. */
export class FinanceApiRequestError extends Error {
  readonly status: number;
  readonly errorKind: string | null;

  constructor(message: string, status: number, errorKind: string | null) {
    super(message);
    this.name = "FinanceApiRequestError";
    this.status = status;
    this.errorKind = errorKind;
  }
}

function apiBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean | undefined> })
    .env;
  const configured = typeof env?.VITE_FINANCE_API_BASE_URL === "string"
    ? env.VITE_FINANCE_API_BASE_URL.trim()
    : "";
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (env?.DEV || env == null) {
    // Vite DEV uses localhost; Node unit tests also lack import.meta.env.
    return "http://localhost:5080";
  }

  throw new Error("VITE_FINANCE_API_BASE_URL is not configured.");
}

async function readApiFailure(
  response: Response
): Promise<{ message: string; errorKind: string | null }> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.message) {
      return { message: body.message, errorKind: body.error ?? null };
    }

    if (body.error) {
      return { message: body.error, errorKind: body.error };
    }
  } catch {
    // Fall through to status text.
  }

  return {
    message: response.statusText || `HTTP ${response.status}`,
    errorKind: null
  };
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
    const failure = await readApiFailure(response);
    throw new FinanceApiRequestError(failure.message, response.status, failure.errorKind);
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

export type InvoiceListQueryOptions = {
  page?: number;
  pageSize?: number;
  documentNumber?: string;
  status?: string;
  createdFromUtc?: string;
  createdToUtc?: string;
};

export function buildInvoicePagedSearchParams(
  options: InvoiceListQueryOptions = {}
): URLSearchParams {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  const documentNumber = options.documentNumber?.trim();
  if (documentNumber) {
    params.set("documentNumber", documentNumber);
  }

  const status = options.status?.trim();
  if (status) {
    params.set("status", status);
  }

  if (options.createdFromUtc) {
    params.set("createdFromUtc", options.createdFromUtc);
  }

  if (options.createdToUtc) {
    params.set("createdToUtc", options.createdToUtc);
  }

  return params;
}

export function listInvoicesPaged(
  workspaceId: string,
  options: InvoiceListQueryOptions = {},
  signal?: AbortSignal
): Promise<InvoicePage> {
  const params = buildInvoicePagedSearchParams(options);

  return requestJson<InvoicePage>(
    `/api/finance-workspaces/${workspaceId}/invoices?${params.toString()}`,
    signal ? { signal } : undefined
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

export function setInvoiceDueDate(
  workspaceId: string,
  invoiceId: string,
  dueDateUtc: string
): Promise<Invoice> {
  return requestJson<Invoice>(
    `/api/finance-workspaces/${workspaceId}/invoices/${invoiceId}/set-due-date`,
    {
      method: "POST",
      body: JSON.stringify({ dueDateUtc })
    }
  );
}

export function addInvoiceLine(
  workspaceId: string,
  invoiceId: string,
  input: {
    quantity: number;
    unitPrice: number;
    description?: string | null;
  }
): Promise<Invoice> {
  return requestJson<Invoice>(
    `/api/finance-workspaces/${workspaceId}/invoices/${invoiceId}/lines`,
    {
      method: "POST",
      body: JSON.stringify({
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        description: input.description ?? null
      })
    }
  );
}

export function updateInvoiceLine(
  workspaceId: string,
  invoiceId: string,
  lineId: string,
  input: {
    quantity: number;
    unitPrice: number;
    description?: string | null;
  }
): Promise<Invoice> {
  return requestJson<Invoice>(
    `/api/finance-workspaces/${workspaceId}/invoices/${invoiceId}/lines/${lineId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        description: input.description ?? null
      })
    }
  );
}

export function removeInvoiceLine(
  workspaceId: string,
  invoiceId: string,
  lineId: string
): Promise<Invoice> {
  return requestJson<Invoice>(
    `/api/finance-workspaces/${workspaceId}/invoices/${invoiceId}/lines/${lineId}`,
    {
      method: "DELETE"
    }
  );
}

export function issueInvoice(workspaceId: string, invoiceId: string): Promise<Invoice> {
  return requestJson<Invoice>(
    `/api/finance-workspaces/${workspaceId}/invoices/${invoiceId}/issue`,
    {
      method: "POST"
    }
  );
}

export function getInvoice(
  workspaceId: string,
  invoiceId: string,
  signal?: AbortSignal
): Promise<Invoice> {
  return requestJson<Invoice>(
    `/api/finance-workspaces/${workspaceId}/invoices/${invoiceId}`,
    signal ? { signal } : undefined
  );
}

export type Accrual = {
  id: string;
  financeWorkspaceId: string;
  type: string;
  amount: number;
  currency: string;
  recognitionDateUtc: string;
  description: string;
  sourceInvoiceId: string | null;
  status: string;
  createdAtUtc: string;
  updatedAtUtc: string;
  recognizedAtUtc: string | null;
  reversedAtUtc: string | null;
  reversalReason: string | null;
};

export type AccrualPage = {
  items: Accrual[];
  page: number;
  pageSize: number;
  totalCount: number;
};

export type AccrualListQueryOptions = {
  page?: number;
  pageSize?: number;
  descriptionPrefix?: string;
  status?: string;
  recognitionFromUtc?: string;
  recognitionToUtc?: string;
};

export function buildAccrualPagedSearchParams(
  options: AccrualListQueryOptions = {}
): URLSearchParams {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize)
  });

  const descriptionPrefix = options.descriptionPrefix?.trim();
  if (descriptionPrefix) {
    params.set("descriptionPrefix", descriptionPrefix);
  }

  const status = options.status?.trim();
  if (status) {
    params.set("status", status);
  }

  if (options.recognitionFromUtc) {
    params.set("recognitionFromUtc", options.recognitionFromUtc);
  }

  if (options.recognitionToUtc) {
    params.set("recognitionToUtc", options.recognitionToUtc);
  }

  return params;
}

export function listAccrualsPaged(
  workspaceId: string,
  options: AccrualListQueryOptions = {},
  signal?: AbortSignal
): Promise<AccrualPage> {
  const params = buildAccrualPagedSearchParams(options);

  return requestJson<AccrualPage>(
    `/api/finance-workspaces/${workspaceId}/accruals/paged?${params.toString()}`,
    signal ? { signal } : undefined
  );
}

export function getAccrual(
  workspaceId: string,
  accrualId: string,
  signal?: AbortSignal
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}`,
    signal ? { signal } : undefined
  );
}

export function createAccrual(
  workspaceId: string,
  input: {
    type: string;
    amount: number;
    currency: string;
    recognitionDateUtc: string;
    description: string;
    sourceInvoiceId?: string | null;
  }
): Promise<Accrual> {
  return requestJson<Accrual>(`/api/finance-workspaces/${workspaceId}/accruals`, {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      amount: input.amount,
      currency: input.currency,
      recognitionDateUtc: input.recognitionDateUtc,
      description: input.description,
      sourceInvoiceId: input.sourceInvoiceId ?? null
    })
  });
}

export function recognizeAccrual(
  workspaceId: string,
  accrualId: string
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/recognize`,
    {
      method: "POST"
    }
  );
}

export function reverseAccrual(
  workspaceId: string,
  accrualId: string,
  reason: string
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/reverse`,
    {
      method: "POST",
      body: JSON.stringify({ reason })
    }
  );
}

export function changeAccrualAmount(
  workspaceId: string,
  accrualId: string,
  amount: number
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/change-amount`,
    {
      method: "POST",
      body: JSON.stringify({ amount })
    }
  );
}

export function changeAccrualSourceInvoice(
  workspaceId: string,
  accrualId: string,
  sourceInvoiceId: string | null
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/change-source-invoice`,
    {
      method: "POST",
      body: JSON.stringify({ sourceInvoiceId })
    }
  );
}

export function changeAccrualDescription(
  workspaceId: string,
  accrualId: string,
  description: string
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/change-description`,
    {
      method: "POST",
      body: JSON.stringify({ description })
    }
  );
}

export function changeAccrualRecognitionDate(
  workspaceId: string,
  accrualId: string,
  recognitionDateUtc: string
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/change-recognition-date`,
    {
      method: "POST",
      body: JSON.stringify({ recognitionDateUtc })
    }
  );
}

export function changeAccrualType(
  workspaceId: string,
  accrualId: string,
  type: string
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/change-type`,
    {
      method: "POST",
      body: JSON.stringify({ type })
    }
  );
}

export function changeAccrualCurrency(
  workspaceId: string,
  accrualId: string,
  currency: string
): Promise<Accrual> {
  return requestJson<Accrual>(
    `/api/finance-workspaces/${workspaceId}/accruals/${accrualId}/change-currency`,
    {
      method: "POST",
      body: JSON.stringify({ currency })
    }
  );
}
