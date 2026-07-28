import type { AccrualListFilters, AccrualStatusFilter } from "./accrualListQuery";
import {
  parseAgingBucketParam,
  type AgingBucketFilter
} from "./invoiceCollections.ts";
import type {
  InvoiceListFilters,
  InvoiceQueueMode,
  InvoiceStatusFilter
} from "./invoiceListQuery";
import type { AppView } from "./navigation";
import {
  parseWorkbenchHideCompletedParam,
  parseWorkbenchSectionParam,
  parseWorkbenchSortParam,
  type WorkbenchSectionFilter,
  type WorkbenchSortMode
} from "./collectionWorkbench.ts";
import {
  parseHistoryEventTypeParam,
  parseHistoryFlagParam,
  type CollectionActivityEventTypeFilter
} from "./collectionCaseHistory.ts";
import {
  parsePromiseGroupParam,
  type PromiseGroupFilter
} from "./promiseToPay.ts";

/** Collection workspace panel: overdue queue (default), follow-ups, or workbench. */
export type CollectionPanelMode = "" | "followups" | "workbench";

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
  /** Payment collection workspace (`queue=overdue` in URL): overdue + due today. */
  invoiceQueue: InvoiceQueueMode;
  /**
   * Overdue-day aging bucket (`aging=` in URL). Meaningful only with queue=overdue.
   * Empty = all attention (overdue + due today).
   */
  agingBucket: AgingBucketFilter;
  /**
   * Collection panel (`panel=followups|workbench` in URL). Meaningful only with queue=overdue.
   * Empty = overdue queue table.
   */
  collectionPanel: CollectionPanelMode;
  /**
   * Promise follow-up / workbench section filter (`promiseGroup=`).
   * Meaningful with panel=followups or panel=workbench.
   */
  promiseGroup: PromiseGroupFilter;
  /** Promise follow-up / workbench search (`promiseQ=`): invoice number or counterparty. */
  promiseSearch: string;
  /**
   * Workbench section filter (`wbSection=`). Meaningful only with panel=workbench.
   * Prefer this over promiseGroup when both are present for workbench section chips.
   */
  workbenchSection: WorkbenchSectionFilter;
  /** Workbench sort (`wbSort=`). Meaningful only with panel=workbench. */
  workbenchSort: WorkbenchSortMode;
  /** Hide completed workbench cases (`wbHideCompleted=1`). */
  workbenchHideCompleted: boolean;
  /**
   * Case history panel open (`caseHistory=1`). Meaningful with queue=overdue + invoiceId.
   */
  caseHistoryOpen: boolean;
  /** History event type filter (`historyType=`). */
  caseHistoryType: CollectionActivityEventTypeFilter;
  /** History note/description search (`historyQ=`). */
  caseHistorySearch: string;
  /** Expand full history (`historyExpanded=1`). */
  caseHistoryExpanded: boolean;
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
  invoiceQueue: "",
  agingBucket: "",
  collectionPanel: "",
  promiseGroup: "",
  promiseSearch: "",
  workbenchSection: "",
  workbenchSort: "priority",
  workbenchHideCompleted: false,
  caseHistoryOpen: false,
  caseHistoryType: "",
  caseHistorySearch: "",
  caseHistoryExpanded: false
};

export function parseCollectionPanelParam(
  value: string | null | undefined
): CollectionPanelMode {
  if (value == null) {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed === "followups" || trimmed === "workbench") {
    return trimmed;
  }
  return "";
}

export function isPromisePanel(panel: CollectionPanelMode): boolean {
  return panel === "followups" || panel === "workbench";
}

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
    invoiceQueue: "",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false
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
  const agingBucket =
    view === "invoices" && invoiceQueue === "overdue"
      ? parseAgingBucketParam(params.get("aging"))
      : "";
  const collectionPanel =
    view === "invoices" && invoiceQueue === "overdue"
      ? parseCollectionPanelParam(params.get("panel"))
      : "";
  const promisePanel = isPromisePanel(collectionPanel);
  const promiseGroup =
    view === "invoices" && invoiceQueue === "overdue" && promisePanel
      ? parsePromiseGroupParam(params.get("promiseGroup"))
      : "";
  const promiseSearch =
    view === "invoices" && invoiceQueue === "overdue" && promisePanel
      ? (params.get("promiseQ")?.trim() ?? "")
      : "";
  const workbenchActive =
    view === "invoices" && invoiceQueue === "overdue" && collectionPanel === "workbench";
  let workbenchSection = workbenchActive
    ? parseWorkbenchSectionParam(params.get("wbSection"))
    : "";
  if (workbenchActive && !workbenchSection) {
    workbenchSection = parseWorkbenchSectionParam(params.get("promiseGroup"));
  }
  const workbenchSort = workbenchActive
    ? parseWorkbenchSortParam(params.get("wbSort"))
    : "priority";
  const workbenchHideCompleted = workbenchActive
    ? parseWorkbenchHideCompletedParam(params.get("wbHideCompleted"))
    : false;
  const historyContext =
    view === "invoices" && invoiceQueue === "overdue" && invoiceId != null;
  const caseHistoryOpen = historyContext
    ? parseHistoryFlagParam(params.get("caseHistory"))
    : false;
  const caseHistoryType =
    historyContext && caseHistoryOpen
      ? parseHistoryEventTypeParam(params.get("historyType"))
      : "";
  const caseHistorySearch =
    historyContext && caseHistoryOpen ? (params.get("historyQ")?.trim() ?? "") : "";
  const caseHistoryExpanded =
    historyContext && caseHistoryOpen
      ? parseHistoryFlagParam(params.get("historyExpanded"))
      : false;

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
      invoiceQueue,
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSection,
      workbenchSort,
      workbenchHideCompleted,
      caseHistoryOpen,
      caseHistoryType,
      caseHistorySearch,
      caseHistoryExpanded
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
    // Payment collection queue derives dueTo at query time; do not freeze today into the URL.
    if (invoiceQueue !== "overdue") {
      setIfPresent(params, "dueTo", filters.dueToDate);
    }
    if (invoiceQueue === "overdue") {
      params.set("queue", "overdue");
      if (state.discovery.agingBucket) {
        params.set("aging", state.discovery.agingBucket);
      }
      if (state.discovery.collectionPanel === "followups") {
        params.set("panel", "followups");
        if (state.discovery.promiseGroup) {
          params.set("promiseGroup", state.discovery.promiseGroup);
        }
        setIfPresent(params, "promiseQ", state.discovery.promiseSearch);
      }
      if (state.discovery.collectionPanel === "workbench") {
        params.set("panel", "workbench");
        if (state.discovery.workbenchSection) {
          params.set("wbSection", state.discovery.workbenchSection);
        } else if (state.discovery.promiseGroup) {
          // Back-compat: allow promiseGroup to drive section when wbSection empty.
          const section = parseWorkbenchSectionParam(state.discovery.promiseGroup);
          if (section) {
            params.set("wbSection", section);
          }
        }
        setIfPresent(params, "promiseQ", state.discovery.promiseSearch);
        if (state.discovery.workbenchSort && state.discovery.workbenchSort !== "priority") {
          params.set("wbSort", state.discovery.workbenchSort);
        }
        if (state.discovery.workbenchHideCompleted) {
          params.set("wbHideCompleted", "1");
        }
      }
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    if (state.invoiceId && isInvoiceId(state.invoiceId)) {
      params.set("invoiceId", state.invoiceId);
      if (invoiceQueue === "overdue" && state.discovery.caseHistoryOpen) {
        params.set("caseHistory", "1");
        if (state.discovery.caseHistoryType) {
          params.set("historyType", state.discovery.caseHistoryType);
        }
        setIfPresent(params, "historyQ", state.discovery.caseHistorySearch);
        if (state.discovery.caseHistoryExpanded) {
          params.set("historyExpanded", "1");
        }
      }
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
    invoiceQueue: "",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false
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
    invoiceQueue: "",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false
  };
}

/**
 * Payment collection workspace: status=Issued + queue=overdue.
 * Server dueToUtc is computed at query time as end of local today (overdue + due today).
 * Aging bucket defaults to all attention.
 */
export function overdueIssuedInvoicesDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: {
      ...EMPTY_INVOICE_FILTERS,
      status: "Issued"
    },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
    invoiceQueue: "overdue",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false
  };
}
