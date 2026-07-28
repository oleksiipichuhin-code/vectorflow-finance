import type { AccrualListFilters, AccrualStatusFilter } from "./accrualListQuery";
import type {
  InvoiceListFilters,
  InvoiceQueueMode,
  InvoiceStatusFilter
} from "./invoiceListQuery";
import type { AppView } from "./navigation";

const VIEW_IDS: ReadonlySet<string> = new Set([
  "dashboard",
  "workspace",
  "invoices",
  "accruals"
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ListDiscovery = {
  page: number;
  invoiceFilters: InvoiceListFilters;
  accrualFilters: AccrualListFilters;
  /** Issued overdue attention queue (`queue=overdue` in URL). */
  invoiceQueue: InvoiceQueueMode;
};

export type AppUrlState = {
  view: AppView;
  workspaceId: string | null;
  /** Accruals detail deep-link; omitted outside accruals view. */
  accrualId: string | null;
  /** Invoices detail deep-link; omitted outside invoices view. */
  invoiceId: string | null;
  discovery: ListDiscovery;
};

export const EMPTY_INVOICE_FILTERS: InvoiceListFilters = {
  documentNumber: "",
  counterpartyReference: "",
  status: "",
  createdFromDate: "",
  createdToDate: "",
  issuedFromDate: "",
  issuedToDate: "",
  dueFromDate: "",
  dueToDate: ""
};

export const EMPTY_ACCRUAL_FILTERS: AccrualListFilters = {
  descriptionPrefix: "",
  status: "",
  recognitionFromDate: "",
  recognitionToDate: ""
};

export const EMPTY_DISCOVERY: ListDiscovery = {
  page: 1,
  invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
  accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
  invoiceQueue: ""
};

export function isAppView(value: string | null | undefined): value is AppView {
  return typeof value === "string" && VIEW_IDS.has(value);
}

export function isWorkspaceId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Same GUID shape as workspace ids; invalid values never become detail targets. */
export function isAccrualId(value: string | null | undefined): value is string {
  return isWorkspaceId(value);
}

/** Same GUID shape; invalid values never become invoice detail targets. */
export function isInvoiceId(value: string | null | undefined): value is string {
  return isWorkspaceId(value);
}

/**
 * Parse accrualId query value.
 * Missing/blank/invalid → null (no API call; normalize strips the param).
 */
export function parseAccrualIdParam(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return isAccrualId(trimmed) ? trimmed : null;
}

/**
 * Parse invoiceId query value.
 * Missing/blank/invalid → null (no API call; normalize strips the param).
 */
export function parseInvoiceIdParam(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return isInvoiceId(trimmed) ? trimmed : null;
}

/** Open accrual detail: set accrualId while preserving all other AppUrlState fields. */
export function withAccrualId(state: AppUrlState, accrualId: string | null): AppUrlState {
  return {
    ...state,
    accrualId: accrualId && isAccrualId(accrualId) ? accrualId : null
  };
}

/** Close accrual detail: clear only accrualId. */
export function withoutAccrualId(state: AppUrlState): AppUrlState {
  return {
    ...state,
    accrualId: null
  };
}

/** Open invoice detail: set invoiceId while preserving all other AppUrlState fields. */
export function withInvoiceId(state: AppUrlState, invoiceId: string | null): AppUrlState {
  return {
    ...state,
    invoiceId: invoiceId && isInvoiceId(invoiceId) ? invoiceId : null
  };
}

/** Close invoice detail: clear only invoiceId. */
export function withoutInvoiceId(state: AppUrlState): AppUrlState {
  return {
    ...state,
    invoiceId: null
  };
}

function parsePage(value: string | null): number {
  if (!value) {
    return 1;
  }

  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
}

function parseDateInput(value: string | null): string {
  if (!value || !DATE_RE.test(value)) {
    return "";
  }

  return value;
}

function parseInvoiceStatus(value: string | null): InvoiceStatusFilter {
  if (value === "Draft" || value === "Issued") {
    return value;
  }

  return "";
}

function parseAccrualStatus(value: string | null): AccrualStatusFilter {
  if (value === "Draft" || value === "Recognized" || value === "Reversed") {
    return value;
  }

  return "";
}

function parseInvoiceQueue(value: string | null): InvoiceQueueMode {
  if (value === "overdue") {
    return "overdue";
  }

  return "";
}

export function createEmptyDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
    invoiceQueue: ""
  };
}

export function parseUrlSearch(search: string): AppUrlState {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );

  const viewParam = params.get("view");
  const view: AppView = isAppView(viewParam) ? viewParam : "dashboard";

  const workspaceRaw = params.get("workspaceId")?.trim() ?? "";
  const workspaceId = isWorkspaceId(workspaceRaw) ? workspaceRaw : null;
  const accrualId = parseAccrualIdParam(params.get("accrualId"));
  const invoiceId = parseInvoiceIdParam(params.get("invoiceId"));

  const page = parsePage(params.get("page"));
  const invoiceQueue = view === "invoices" ? parseInvoiceQueue(params.get("queue")) : "";

  const invoiceFilters: InvoiceListFilters = {
    documentNumber: params.get("documentNumber")?.trim() ?? "",
    counterpartyReference: params.get("counterpartyReference")?.trim() ?? "",
    status: parseInvoiceStatus(params.get("status")),
    createdFromDate: parseDateInput(params.get("createdFrom")),
    createdToDate: parseDateInput(params.get("createdTo")),
    issuedFromDate: parseDateInput(params.get("issuedFrom")),
    issuedToDate: parseDateInput(params.get("issuedTo")),
    dueFromDate: parseDateInput(params.get("dueFrom")),
    dueToDate: parseDateInput(params.get("dueTo"))
  };

  // Overdue queue is Issued-only; repair missing/invalid status from the durable marker.
  if (invoiceQueue === "overdue") {
    invoiceFilters.status = "Issued";
  }

  const accrualFilters: AccrualListFilters = {
    descriptionPrefix: params.get("descriptionPrefix")?.trim() ?? "",
    status: parseAccrualStatus(params.get("status")),
    recognitionFromDate: parseDateInput(params.get("recognitionFrom")),
    recognitionToDate: parseDateInput(params.get("recognitionTo"))
  };

  return {
    view,
    workspaceId,
    accrualId: view === "accruals" ? accrualId : null,
    invoiceId: view === "invoices" ? invoiceId : null,
    discovery: {
      page,
      invoiceFilters,
      accrualFilters,
      invoiceQueue
    }
  };
}

function setIfPresent(params: URLSearchParams, key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}

/**
 * Builds a stable query string for the Finance Web shell.
 * Defaults (dashboard view, page 1, empty filters) are omitted.
 * List filters not relevant to the active view are omitted.
 */
export function buildUrlSearch(state: AppUrlState): string {
  const params = new URLSearchParams();

  if (state.view !== "dashboard") {
    params.set("view", state.view);
  }

  if (state.workspaceId && isWorkspaceId(state.workspaceId)) {
    params.set("workspaceId", state.workspaceId);
  }

  const page = state.discovery.page < 1 ? 1 : Math.floor(state.discovery.page);

  if (state.view === "invoices") {
    const filters = state.discovery.invoiceFilters;
    const invoiceQueue = state.discovery.invoiceQueue === "overdue" ? "overdue" : "";
    setIfPresent(params, "documentNumber", filters.documentNumber);
    setIfPresent(params, "counterpartyReference", filters.counterpartyReference);
    if (invoiceQueue === "overdue" || filters.status === "Draft" || filters.status === "Issued") {
      params.set(
        "status",
        invoiceQueue === "overdue" ? "Issued" : (filters.status as "Draft" | "Issued")
      );
    }
    setIfPresent(params, "createdFrom", filters.createdFromDate);
    setIfPresent(params, "createdTo", filters.createdToDate);
    setIfPresent(params, "issuedFrom", filters.issuedFromDate);
    setIfPresent(params, "issuedTo", filters.issuedToDate);
    setIfPresent(params, "dueFrom", filters.dueFromDate);
    // Overdue queue derives dueTo at query time; do not freeze yesterday into the URL.
    if (invoiceQueue !== "overdue") {
      setIfPresent(params, "dueTo", filters.dueToDate);
    }
    if (invoiceQueue === "overdue") {
      params.set("queue", "overdue");
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    if (state.invoiceId && isInvoiceId(state.invoiceId)) {
      params.set("invoiceId", state.invoiceId);
    }
  }

  if (state.view === "accruals") {
    const filters = state.discovery.accrualFilters;
    setIfPresent(params, "descriptionPrefix", filters.descriptionPrefix);
    if (
      filters.status === "Draft" ||
      filters.status === "Recognized" ||
      filters.status === "Reversed"
    ) {
      params.set("status", filters.status);
    }
    setIfPresent(params, "recognitionFrom", filters.recognitionFromDate);
    setIfPresent(params, "recognitionTo", filters.recognitionToDate);
    if (page > 1) {
      params.set("page", String(page));
    }
    if (state.accrualId && isAccrualId(state.accrualId)) {
      params.set("accrualId", state.accrualId);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function urlStatesEqual(a: AppUrlState, b: AppUrlState): boolean {
  return buildUrlSearch(a) === buildUrlSearch(b);
}

/** Draft invoices filter: status=Draft, page 1, other invoice filters cleared. */
export function draftInvoicesDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: {
      ...EMPTY_INVOICE_FILTERS,
      status: "Draft"
    },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
    invoiceQueue: ""
  };
}

/**
 * Issued invoices attention queue: status=Issued, page 1, other invoice filters cleared.
 * Due-date bounds are left empty so the accountant sets a real payment window in the list.
 */
export function issuedInvoicesDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: {
      ...EMPTY_INVOICE_FILTERS,
      status: "Issued"
    },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
    invoiceQueue: ""
  };
}

/**
 * Overdue Issued queue: status=Issued + queue=overdue.
 * Server dueToUtc is computed at query time as end of local yesterday (inclusive bound).
 */
export function overdueIssuedInvoicesDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: {
      ...EMPTY_INVOICE_FILTERS,
      status: "Issued"
    },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
    invoiceQueue: "overdue"
  };
}
