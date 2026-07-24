import type { AccrualListFilters } from "./accrualListQuery";
import type { InvoiceListFilters, InvoiceStatusFilter } from "./invoiceListQuery";
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
};

export type AppUrlState = {
  view: AppView;
  workspaceId: string | null;
  discovery: ListDiscovery;
};

export const EMPTY_INVOICE_FILTERS: InvoiceListFilters = {
  documentNumber: "",
  status: "",
  createdFromDate: "",
  createdToDate: ""
};

export const EMPTY_ACCRUAL_FILTERS: AccrualListFilters = {
  descriptionPrefix: "",
  recognitionFromDate: "",
  recognitionToDate: ""
};

export const EMPTY_DISCOVERY: ListDiscovery = {
  page: 1,
  invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
  accrualFilters: { ...EMPTY_ACCRUAL_FILTERS }
};

export function isAppView(value: string | null | undefined): value is AppView {
  return typeof value === "string" && VIEW_IDS.has(value);
}

export function isWorkspaceId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
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

export function createEmptyDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS }
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

  const page = parsePage(params.get("page"));

  const invoiceFilters: InvoiceListFilters = {
    documentNumber: params.get("documentNumber")?.trim() ?? "",
    status: parseInvoiceStatus(params.get("status")),
    createdFromDate: parseDateInput(params.get("createdFrom")),
    createdToDate: parseDateInput(params.get("createdTo"))
  };

  const accrualFilters: AccrualListFilters = {
    descriptionPrefix: params.get("descriptionPrefix")?.trim() ?? "",
    recognitionFromDate: parseDateInput(params.get("recognitionFrom")),
    recognitionToDate: parseDateInput(params.get("recognitionTo"))
  };

  return {
    view,
    workspaceId,
    discovery: {
      page,
      invoiceFilters,
      accrualFilters
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
    setIfPresent(params, "documentNumber", filters.documentNumber);
    if (filters.status === "Draft" || filters.status === "Issued") {
      params.set("status", filters.status);
    }
    setIfPresent(params, "createdFrom", filters.createdFromDate);
    setIfPresent(params, "createdTo", filters.createdToDate);
    if (page > 1) {
      params.set("page", String(page));
    }
  }

  if (state.view === "accruals") {
    const filters = state.discovery.accrualFilters;
    setIfPresent(params, "descriptionPrefix", filters.descriptionPrefix);
    setIfPresent(params, "recognitionFrom", filters.recognitionFromDate);
    setIfPresent(params, "recognitionTo", filters.recognitionToDate);
    if (page > 1) {
      params.set("page", String(page));
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
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS }
  };
}
