import type { AccrualListFilters, AccrualStatusFilter } from "./accrualListQuery";
import {
  parseAgingBucketParam,
  type AgingBucketFilter
} from "./invoiceCollections.ts";
import { parseQueueShowSettledParam } from "./collectionQueueSettlement.ts";
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
  "accruals",
  "journals",
  "ledger",
  "trial-balance",
  "account-statement",
  "customer-ledger"
]);

export type JournalStatusFilter = "" | "Draft" | "Posted";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ListDiscovery = {
  page: number;
  invoiceFilters: InvoiceListFilters;
  accrualFilters: AccrualListFilters;
  /** Journal list status filter when `view=journals` (`status=Draft|Posted`). */
  journalStatus: JournalStatusFilter;
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
   * Hide settled (paid/completed) invoices from the overdue queue table.
   * Default true. When false, URL includes `queueShowSettled=1`.
   */
  queueHideSettled: boolean;
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
  /**
   * Account statement period from (`periodFrom=` YYYY-MM-DD) when `view=account-statement`.
   */
  statementPeriodFrom: string;
  /**
   * Account statement period to (`periodTo=` YYYY-MM-DD) when `view=account-statement`.
   */
  statementPeriodTo: string;
  /**
   * Ledger posted-from filter (`postedFrom=` YYYY-MM-DD) when `view=ledger`.
   */
  ledgerPostedFrom: string;
  /**
   * Ledger posted-to filter (`postedTo=` YYYY-MM-DD) when `view=ledger`.
   */
  ledgerPostedTo: string;
  /**
   * Ledger source journal filter (`sourceJournalEntryId=`) when `view=ledger`.
   */
  ledgerSourceJournalEntryId: string;
  /**
   * Customer ledger search (`customerQ=`) when `view=customer-ledger`.
   */
  customerLedgerQuery: string;
  /**
   * Customer ledger overdue aging bucket (`aging=`) when `view=customer-ledger`.
   */
  customerLedgerAging: AgingBucketFilter;
  /**
   * Selected customer ledger counterparty (`counterpartyReference=`) when `view=customer-ledger`.
   */
  customerLedgerCounterparty: string;
};

export type AppUrlState = {
  view: AppView;
  workspaceId: string | null;
  /** Accruals detail deep-link; omitted outside accruals view. */
  accrualId: string | null;
  /** Invoices / customer-ledger detail deep-link; omitted outside those views. */
  invoiceId: string | null;
  /** Journal entry detail deep-link; omitted outside journals view. */
  journalEntryId: string | null;
  /** Account statement detail deep-link; omitted outside account-statement view. */
  accountId: string | null;
  /** Ledger posting detail deep-link; omitted outside ledger view. */
  ledgerPostingId: string | null;
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
  journalStatus: "",
  invoiceQueue: "",
  agingBucket: "",
  collectionPanel: "",
  promiseGroup: "",
  promiseSearch: "",
  workbenchSection: "",
  workbenchSort: "priority",
  workbenchHideCompleted: false,
  queueHideSettled: true,
  caseHistoryOpen: false,
  caseHistoryType: "",
  caseHistorySearch: "",
  caseHistoryExpanded: false,
  statementPeriodFrom: "",
  statementPeriodTo: "",
  ledgerPostedFrom: "",
  ledgerPostedTo: "",
  ledgerSourceJournalEntryId: "",
  customerLedgerQuery: "",
  customerLedgerAging: "",
  customerLedgerCounterparty: ""
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

/** Same GUID shape; invalid values never become journal detail targets. */
export function isJournalEntryId(value: string | null | undefined): value is string {
  return isWorkspaceId(value);
}

/** Same GUID shape; invalid values never become account statement targets. */
export function isAccountId(value: string | null | undefined): value is string {
  return isWorkspaceId(value);
}

/** Same GUID shape; invalid values never become ledger posting detail targets. */
export function isLedgerPostingId(value: string | null | undefined): value is string {
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

/**
 * Parse journalEntryId query value.
 * Missing/blank/invalid → null (no API call; normalize strips the param).
 */
export function parseJournalEntryIdParam(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return isJournalEntryId(trimmed) ? trimmed : null;
}

/**
 * Parse accountId query value for account-statement view.
 * Missing/blank/invalid → null (no API call; normalize strips the param).
 */
export function parseAccountIdParam(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return isAccountId(trimmed) ? trimmed : null;
}

/**
 * Parse ledgerPostingId query value for ledger view.
 * Missing/blank/invalid → null (no API call; normalize strips the param).
 */
export function parseLedgerPostingIdParam(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return isLedgerPostingId(trimmed) ? trimmed : null;
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

/** Open journal detail: set journalEntryId while preserving all other AppUrlState fields. */
export function withJournalEntryId(
  state: AppUrlState,
  journalEntryId: string | null
): AppUrlState {
  return {
    ...state,
    journalEntryId:
      journalEntryId && isJournalEntryId(journalEntryId) ? journalEntryId : null
  };
}

/** Close journal detail: clear only journalEntryId. */
export function withoutJournalEntryId(state: AppUrlState): AppUrlState {
  return {
    ...state,
    journalEntryId: null
  };
}

/** Open account statement: set accountId while preserving other AppUrlState fields. */
export function withAccountId(state: AppUrlState, accountId: string | null): AppUrlState {
  return {
    ...state,
    accountId: accountId && isAccountId(accountId) ? accountId : null
  };
}

/** Close account statement detail: clear only accountId. */
export function withoutAccountId(state: AppUrlState): AppUrlState {
  return {
    ...state,
    accountId: null
  };
}

/** Open ledger posting detail: set ledgerPostingId while preserving other AppUrlState fields. */
export function withLedgerPostingId(
  state: AppUrlState,
  ledgerPostingId: string | null
): AppUrlState {
  return {
    ...state,
    ledgerPostingId:
      ledgerPostingId && isLedgerPostingId(ledgerPostingId) ? ledgerPostingId : null
  };
}

/** Close ledger posting detail: clear only ledgerPostingId. */
export function withoutLedgerPostingId(state: AppUrlState): AppUrlState {
  return {
    ...state,
    ledgerPostingId: null
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

function parseJournalStatus(value: string | null): JournalStatusFilter {
  if (value === "Draft" || value === "Posted") {
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
    journalStatus: "",
    invoiceQueue: "",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    queueHideSettled: true,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false,
    statementPeriodFrom: "",
    statementPeriodTo: "",
    ledgerPostedFrom: "",
    ledgerPostedTo: "",
    ledgerSourceJournalEntryId: "",
    customerLedgerQuery: "",
    customerLedgerAging: "",
    customerLedgerCounterparty: ""
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
  const journalEntryId = parseJournalEntryIdParam(params.get("journalEntryId"));
  const accountId = parseAccountIdParam(params.get("accountId"));
  const ledgerPostingId = parseLedgerPostingIdParam(params.get("ledgerPostingId"));

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
  const queueHideSettled =
    view === "invoices" && invoiceQueue === "overdue"
      ? !parseQueueShowSettledParam(params.get("queueShowSettled"))
      : true;
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
    status: view === "accruals" ? parseAccrualStatus(params.get("status")) : "",
    recognitionFromDate: parseDateInput(params.get("recognitionFrom")),
    recognitionToDate: parseDateInput(params.get("recognitionTo"))
  };

  const journalStatus =
    view === "journals" ? parseJournalStatus(params.get("status")) : "";

  const statementPeriodFrom =
    view === "account-statement" ? parseDateInput(params.get("periodFrom")) : "";
  const statementPeriodTo =
    view === "account-statement" ? parseDateInput(params.get("periodTo")) : "";

  const ledgerPostedFrom =
    view === "ledger" ? parseDateInput(params.get("postedFrom")) : "";
  const ledgerPostedTo = view === "ledger" ? parseDateInput(params.get("postedTo")) : "";
  const ledgerSourceJournalEntryId =
    view === "ledger"
      ? parseJournalEntryIdParam(params.get("sourceJournalEntryId")) ?? ""
      : "";

  const customerLedgerQuery =
    view === "customer-ledger" ? (params.get("customerQ")?.trim() ?? "") : "";
  const customerLedgerAging =
    view === "customer-ledger" ? parseAgingBucketParam(params.get("aging")) : "";
  const customerLedgerCounterparty =
    view === "customer-ledger"
      ? (params.get("counterpartyReference")?.trim() ?? "")
      : "";

  return {
    view,
    workspaceId,
    accrualId: view === "accruals" ? accrualId : null,
    invoiceId: view === "invoices" || view === "customer-ledger" ? invoiceId : null,
    journalEntryId: view === "journals" ? journalEntryId : null,
    accountId: view === "account-statement" ? accountId : null,
    ledgerPostingId: view === "ledger" ? ledgerPostingId : null,
    discovery: {
      page,
      invoiceFilters,
      accrualFilters,
      journalStatus,
      invoiceQueue,
      agingBucket,
      collectionPanel,
      promiseGroup,
      promiseSearch,
      workbenchSection,
      workbenchSort,
      workbenchHideCompleted,
      queueHideSettled,
      caseHistoryOpen,
      caseHistoryType,
      caseHistorySearch,
      caseHistoryExpanded,
      statementPeriodFrom,
      statementPeriodTo,
      ledgerPostedFrom,
      ledgerPostedTo,
      ledgerSourceJournalEntryId,
      customerLedgerQuery,
      customerLedgerAging,
      customerLedgerCounterparty
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
      if (state.discovery.queueHideSettled === false) {
        params.set("queueShowSettled", "1");
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

  if (state.view === "journals") {
    if (
      state.discovery.journalStatus === "Draft" ||
      state.discovery.journalStatus === "Posted"
    ) {
      params.set("status", state.discovery.journalStatus);
    }
    if (page > 1) {
      params.set("page", String(page));
    }
    if (state.journalEntryId && isJournalEntryId(state.journalEntryId)) {
      params.set("journalEntryId", state.journalEntryId);
    }
  }

  if (state.view === "account-statement") {
    setIfPresent(params, "periodFrom", state.discovery.statementPeriodFrom);
    setIfPresent(params, "periodTo", state.discovery.statementPeriodTo);
    if (state.accountId && isAccountId(state.accountId)) {
      params.set("accountId", state.accountId);
    }
  }

  if (state.view === "ledger") {
    setIfPresent(params, "postedFrom", state.discovery.ledgerPostedFrom);
    setIfPresent(params, "postedTo", state.discovery.ledgerPostedTo);
    setIfPresent(
      params,
      "sourceJournalEntryId",
      state.discovery.ledgerSourceJournalEntryId
    );
    if (state.ledgerPostingId && isLedgerPostingId(state.ledgerPostingId)) {
      params.set("ledgerPostingId", state.ledgerPostingId);
    }
  }

  if (state.view === "customer-ledger") {
    setIfPresent(params, "customerQ", state.discovery.customerLedgerQuery);
    if (state.discovery.customerLedgerAging) {
      params.set("aging", state.discovery.customerLedgerAging);
    }
    setIfPresent(
      params,
      "counterpartyReference",
      state.discovery.customerLedgerCounterparty
    );
    if (state.invoiceId && isInvoiceId(state.invoiceId)) {
      params.set("invoiceId", state.invoiceId);
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
    journalStatus: "",
    invoiceQueue: "",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    queueHideSettled: true,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false,
    statementPeriodFrom: "",
    statementPeriodTo: "",
    ledgerPostedFrom: "",
    ledgerPostedTo: "",
    ledgerSourceJournalEntryId: "",
    customerLedgerQuery: "",
    customerLedgerAging: "",
    customerLedgerCounterparty: ""
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
    journalStatus: "",
    invoiceQueue: "",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    queueHideSettled: true,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false,
    statementPeriodFrom: "",
    statementPeriodTo: "",
    ledgerPostedFrom: "",
    ledgerPostedTo: "",
    ledgerSourceJournalEntryId: "",
    customerLedgerQuery: "",
    customerLedgerAging: "",
    customerLedgerCounterparty: ""
  };
}

/**
 * Payment collection workspace: status=Issued + queue=overdue.
 * Server dueToUtc is computed at query time as end of local today (overdue + due today).
 * Aging bucket defaults to all attention.
 * Settled (paid/completed) cases are hidden from the overdue queue by default.
 */
export function overdueIssuedInvoicesDiscovery(): ListDiscovery {
  return {
    page: 1,
    invoiceFilters: {
      ...EMPTY_INVOICE_FILTERS,
      status: "Issued"
    },
    accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
    journalStatus: "",
    invoiceQueue: "overdue",
    agingBucket: "",
    collectionPanel: "",
    promiseGroup: "",
    promiseSearch: "",
    workbenchSection: "",
    workbenchSort: "priority",
    workbenchHideCompleted: false,
    queueHideSettled: true,
    caseHistoryOpen: false,
    caseHistoryType: "",
    caseHistorySearch: "",
    caseHistoryExpanded: false,
    statementPeriodFrom: "",
    statementPeriodTo: "",
    ledgerPostedFrom: "",
    ledgerPostedTo: "",
    ledgerSourceJournalEntryId: "",
    customerLedgerQuery: "",
    customerLedgerAging: "",
    customerLedgerCounterparty: ""
  };
}

/**
 * Payment collections focused on one counterparty (exact reference).
 */
export function collectionsForCounterpartyDiscovery(
  counterpartyReference: string
): ListDiscovery {
  const trimmed = counterpartyReference.trim();
  return {
    ...overdueIssuedInvoicesDiscovery(),
    invoiceFilters: {
      ...EMPTY_INVOICE_FILTERS,
      status: "Issued",
      counterpartyReference: trimmed
    }
  };
}
