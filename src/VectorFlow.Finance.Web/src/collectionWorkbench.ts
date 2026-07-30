/**
 * Collection Workbench — daily operations surface for open collection cases.
 * Builds on promise follow-up + resolution records (browser-local). No AI.
 */

import i18n from "./i18n/index.ts";
import type { CurrencyTotal } from "./invoiceCollections.ts";
import {
  dueDateCalendarString,
  localCalendarDateString
} from "./invoiceDueDateAging.ts";
import {
  buildPromiseFollowUpItems,
  comparePromiseFollowUpPriority,
  filterPromiseFollowUps,
  readPromiseFromStorage,
  updatePromiseStatus,
  type PromiseFollowUpItem,
  type PromiseFollowUpStatus,
  type PromiseGroupFilter,
  type PromiseGroupId,
  type PromiseInvoiceLike,
  type PromiseToPayRecord
} from "./promiseToPay.ts";

/** Primary workbench sections (daily ops). */
export type WorkbenchSectionId =
  | "due_today"
  | "broken"
  | "escalated"
  | "disputed"
  | "payment_plans"
  | "handoffs"
  | "reminders"
  | "evidence"
  | "follow_up_required";

export type WorkbenchSectionFilter = "" | WorkbenchSectionId;

export type WorkbenchSortMode =
  | "priority"
  | "amount_desc"
  | "promise_date_asc"
  | "customer_asc"
  | "invoice_asc";

export type NextBestActionId =
  | "contact_customer"
  | "wait"
  | "verify_payment"
  | "review_escalation"
  | "review_dispute"
  | "track_payment_plan"
  | "review_handoff"
  | "complete_reminder"
  | "retry_contact"
  | "follow_up"
  | "none";

export type WorkbenchMassActionId =
  | "mark_contacted"
  | "mark_follow_up_required"
  | "complete";

export type WorkbenchCase = PromiseFollowUpItem & {
  nextBestAction: NextBestActionId;
  nextBestActionLabel: string;
};

export type WorkbenchSectionSummary = {
  id: WorkbenchSectionId;
  label: string;
  count: number;
  totalsByCurrency: CurrencyTotal[];
  cases: WorkbenchCase[];
};

export type WorkbenchKpi = {
  activeCollectionCases: number;
  dueTodayCount: number;
  brokenCount: number;
  escalatedCount: number;
  disputedCount: number;
  paymentPlanCount: number;
  handoffCount: number;
  reminderDueCount: number;
  evidenceCount: number;
  completedTodayCount: number;
};

export type WorkbenchSectionOption = {
  id: WorkbenchSectionFilter;
  label: string;
  shortLabel: string;
};

export type WorkbenchSortOption = {
  id: WorkbenchSortMode;
  label: string;
};

export const WORKBENCH_SECTION_IDS: readonly WorkbenchSectionId[] = [
  "due_today",
  "broken",
  "escalated",
  "disputed",
  "payment_plans",
  "handoffs",
  "reminders",
  "evidence",
  "follow_up_required"
];

export const WORKBENCH_SECTION_OPTIONS: readonly WorkbenchSectionOption[] = [
  { id: "", label: "All sections", shortLabel: "All" },
  { id: "due_today", label: "Due Today", shortLabel: "Due Today" },
  { id: "broken", label: "Broken Promises", shortLabel: "Broken" },
  { id: "escalated", label: "Escalated", shortLabel: "Escalated" },
  { id: "disputed", label: "Disputed", shortLabel: "Disputed" },
  { id: "payment_plans", label: "Payment plans", shortLabel: "Plans" },
  { id: "handoffs", label: "Handoffs", shortLabel: "Handoffs" },
  { id: "reminders", label: "Reminders Due", shortLabel: "Reminders" },
  { id: "evidence", label: "Supporting Evidence", shortLabel: "Evidence" },
  {
    id: "follow_up_required",
    label: "Follow-up Required",
    shortLabel: "Follow-up"
  }
];

export const WORKBENCH_SORT_OPTIONS: readonly WorkbenchSortOption[] = [
  { id: "priority", label: "Priority" },
  { id: "amount_desc", label: "Amount ↓" },
  { id: "promise_date_asc", label: "Promise date ↑" },
  { id: "customer_asc", label: "Customer A–Z" },
  { id: "invoice_asc", label: "Invoice A–Z" }
];

const SECTION_SET: ReadonlySet<string> = new Set(WORKBENCH_SECTION_IDS);

const SORT_SET: ReadonlySet<string> = new Set([
  "priority",
  "amount_desc",
  "promise_date_asc",
  "customer_asc",
  "invoice_asc"
]);

const NBA_IDS: ReadonlySet<string> = new Set<NextBestActionId>([
  "contact_customer",
  "wait",
  "verify_payment",
  "review_escalation",
  "review_dispute",
  "track_payment_plan",
  "review_handoff",
  "complete_reminder",
  "retry_contact",
  "follow_up",
  "none"
]);

export function parseWorkbenchSectionParam(
  value: string | null | undefined
): WorkbenchSectionFilter {
  if (value == null) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return SECTION_SET.has(trimmed) ? (trimmed as WorkbenchSectionId) : "";
}

export function parseWorkbenchSortParam(
  value: string | null | undefined
): WorkbenchSortMode {
  if (value == null) {
    return "priority";
  }
  const trimmed = value.trim();
  if (!trimmed || !SORT_SET.has(trimmed)) {
    return "priority";
  }
  return trimmed as WorkbenchSortMode;
}

export function parseWorkbenchHideCompletedParam(
  value: string | null | undefined
): boolean {
  if (value == null) {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true" || trimmed === "yes";
}

/** Catalog key for a workbench section id; `""` means "all sections". */
export function workbenchSectionKey(section: WorkbenchSectionFilter): string {
  return `workbench.section.${section || "all"}`;
}

export function workbenchSectionShortKey(section: WorkbenchSectionFilter): string {
  return `workbench.sectionShort.${section || "all"}`;
}

export function workbenchSortKey(mode: WorkbenchSortMode): string {
  return `workbench.sort.${mode}`;
}

export function workbenchSectionLabel(section: WorkbenchSectionFilter): string {
  const found = WORKBENCH_SECTION_OPTIONS.find((option) => option.id === section);
  return i18n.t(workbenchSectionKey(found?.id ?? ""), { ns: "finance" });
}

export function nextBestActionLabel(action: NextBestActionId): string {
  return NBA_IDS.has(action)
    ? i18n.t(`workbench.nba.${action}`, { ns: "finance" })
    : action;
}

/**
 * Deterministic next-best-action rules for an open collection case.
 * Resolution "unable_to_contact" wins over calendar/group buckets.
 * Due/overdue open reminders nudge completion when no higher-priority action applies.
 * Open handoff notes nudge review when no higher-priority action applies.
 */
export function resolveNextBestAction(
  item: Pick<
    PromiseFollowUpItem,
    | "group"
    | "resolution"
    | "status"
    | "hasOpenHandoffNotes"
    | "hasDueOpenReminders"
  >
): NextBestActionId {
  if (item.group === "completed" || item.status === "completed") {
    return "none";
  }

  if (item.resolution?.kind === "unable_to_contact") {
    return "retry_contact";
  }

  switch (item.group) {
    case "broken":
      return "contact_customer";
    case "upcoming":
      if (item.hasDueOpenReminders) {
        return "complete_reminder";
      }
      return item.hasOpenHandoffNotes ? "review_handoff" : "wait";
    case "due_today":
      return item.hasDueOpenReminders ? "complete_reminder" : "verify_payment";
    case "escalated":
      return "review_escalation";
    case "disputed":
      return "review_dispute";
    case "payment_plans":
      return item.hasDueOpenReminders ? "complete_reminder" : "track_payment_plan";
    case "follow_up_required":
      if (item.hasDueOpenReminders) {
        return "complete_reminder";
      }
      return item.hasOpenHandoffNotes ? "review_handoff" : "contact_customer";
    default:
      if (item.hasDueOpenReminders) {
        return "complete_reminder";
      }
      return item.hasOpenHandoffNotes ? "review_handoff" : "follow_up";
  }
}

export function toWorkbenchCase(item: PromiseFollowUpItem): WorkbenchCase {
  const nextBestAction = resolveNextBestAction(item);
  return {
    ...item,
    nextBestAction,
    nextBestActionLabel: nextBestActionLabel(nextBestAction)
  };
}

function totalsByCurrencyFor(cases: readonly WorkbenchCase[]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const item of cases) {
    const code = item.currency?.trim() || "—";
    totals.set(code, (totals.get(code) ?? 0) + item.overdueAmount);
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function isCompletedToday(item: PromiseFollowUpItem, now: Date): boolean {
  if (item.group !== "completed") {
    return false;
  }
  const resolvedAt = item.resolution?.resolvedAtUtc ?? item.completedAtUtc;
  if (!resolvedAt) {
    return false;
  }
  const day = dueDateCalendarString(resolvedAt);
  return day === localCalendarDateString(now);
}

export function isWorkbenchSectionGroup(
  group: PromiseGroupId
): group is Exclude<WorkbenchSectionId, "handoffs" | "reminders" | "evidence"> {
  return group !== "upcoming" && group !== "completed" && SECTION_SET.has(group);
}

export function compareWorkbenchCases(
  a: WorkbenchCase,
  b: WorkbenchCase,
  sort: WorkbenchSortMode = "priority"
): number {
  switch (sort) {
    case "amount_desc":
      if (a.overdueAmount !== b.overdueAmount) {
        return b.overdueAmount - a.overdueAmount;
      }
      break;
    case "promise_date_asc":
      if (a.promiseDate !== b.promiseDate) {
        return a.promiseDate < b.promiseDate ? -1 : 1;
      }
      break;
    case "customer_asc": {
      const ca = a.counterpartyReference.toLowerCase();
      const cb = b.counterpartyReference.toLowerCase();
      if (ca !== cb) {
        return ca < cb ? -1 : 1;
      }
      break;
    }
    case "invoice_asc": {
      const ia = a.documentNumber.toLowerCase();
      const ib = b.documentNumber.toLowerCase();
      if (ia !== ib) {
        return ia < ib ? -1 : 1;
      }
      break;
    }
    case "priority":
    default:
      break;
  }
  return comparePromiseFollowUpPriority(a, b);
}

export type WorkbenchQueryOptions = {
  section?: WorkbenchSectionFilter;
  search?: string;
  sort?: WorkbenchSortMode;
  hideCompleted?: boolean;
};

/**
 * Filter + sort workbench cases. Section filter maps to promise group ids,
 * except "handoffs" (open handoff notes), "reminders" (due/overdue open
 * reminders), and "evidence" (active supporting attachments) which are
 * cross-cutting. When hideCompleted is true, completed cases are excluded.
 */
export function filterWorkbenchCases(
  cases: readonly WorkbenchCase[],
  options: WorkbenchQueryOptions = {}
): WorkbenchCase[] {
  const section = options.section ?? "";
  const sort = options.sort ?? "priority";
  const hideCompleted = options.hideCompleted === true;
  const search = (options.search ?? "").trim().toLowerCase();

  const filtered = cases.filter((item) => {
    if (hideCompleted && item.group === "completed") {
      return false;
    }
    if (section === "handoffs") {
      if (!item.hasOpenHandoffNotes) {
        return false;
      }
    } else if (section === "reminders") {
      if (!item.hasDueOpenReminders) {
        return false;
      }
    } else if (section === "evidence") {
      if (!item.hasActiveAttachments) {
        return false;
      }
    } else if (section && item.group !== section) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack =
      `${item.documentNumber} ${item.counterpartyReference} ${item.nextBestActionLabel}`.toLowerCase();
    return haystack.includes(search);
  });

  return filtered.slice().sort((a, b) => compareWorkbenchCases(a, b, sort));
}

export function buildWorkbenchCases(
  invoices: readonly PromiseInvoiceLike[],
  records: readonly PromiseToPayRecord[],
  now: Date = new Date()
): WorkbenchCase[] {
  return buildPromiseFollowUpItems(invoices, records, now).map(toWorkbenchCase);
}

export function buildWorkbenchKpi(
  cases: readonly WorkbenchCase[],
  now: Date = new Date()
): WorkbenchKpi {
  const activeCollectionCases = cases.filter(
    (item) => item.group !== "completed"
  ).length;
  return {
    activeCollectionCases,
    dueTodayCount: cases.filter((item) => item.group === "due_today").length,
    brokenCount: cases.filter((item) => item.group === "broken").length,
    escalatedCount: cases.filter((item) => item.group === "escalated").length,
    disputedCount: cases.filter((item) => item.group === "disputed").length,
    paymentPlanCount: cases.filter((item) => item.group === "payment_plans").length,
    handoffCount: cases.filter(
      (item) => item.group !== "completed" && item.hasOpenHandoffNotes
    ).length,
    reminderDueCount: cases.filter(
      (item) => item.group !== "completed" && item.hasDueOpenReminders
    ).length,
    evidenceCount: cases.filter(
      (item) => item.group !== "completed" && item.hasActiveAttachments
    ).length,
    completedTodayCount: cases.filter((item) => isCompletedToday(item, now))
      .length
  };
}

export function groupWorkbenchSections(
  cases: readonly WorkbenchCase[],
  sort: WorkbenchSortMode = "priority"
): WorkbenchSectionSummary[] {
  return WORKBENCH_SECTION_IDS.map((id) => {
    const sectionCases = cases
      .filter((item) => {
        if (id === "handoffs") {
          return item.hasOpenHandoffNotes;
        }
        if (id === "reminders") {
          return item.hasDueOpenReminders;
        }
        if (id === "evidence") {
          return item.hasActiveAttachments;
        }
        return item.group === id;
      })
      .slice()
      .sort((a, b) => compareWorkbenchCases(a, b, sort));
    return {
      id,
      label: workbenchSectionLabel(id),
      count: sectionCases.length,
      totalsByCurrency: totalsByCurrencyFor(sectionCases),
      cases: sectionCases
    };
  });
}

/**
 * Build section summaries from filtered cases.
 * When a section filter is active, only that section is returned (even if empty).
 */
export function buildWorkbenchSectionSummaries(
  cases: readonly WorkbenchCase[],
  options: WorkbenchQueryOptions = {}
): WorkbenchSectionSummary[] {
  const filtered = filterWorkbenchCases(cases, {
    ...options,
    section: ""
  });
  const sort = options.sort ?? "priority";
  const sections = groupWorkbenchSections(filtered, sort);
  const section = options.section ?? "";
  if (!section) {
    return sections.filter((entry) => entry.count > 0);
  }
  return sections.filter((entry) => entry.id === section);
}

export type MassActionResult = {
  okIds: string[];
  skippedIds: string[];
  errorIds: { invoiceId: string; error: string }[];
};

function massActionToStatus(
  action: WorkbenchMassActionId
): PromiseFollowUpStatus {
  switch (action) {
    case "mark_contacted":
      return "contacted";
    case "mark_follow_up_required":
      return "follow_up_required";
    case "complete":
      return "completed";
  }
}

/**
 * Apply a safe mass status update to selected invoice ids.
 * Missing records are skipped; write failures are collected without aborting the batch.
 */
export function applyWorkbenchMassAction(
  invoiceIds: readonly string[],
  action: WorkbenchMassActionId,
  options?: { storage?: Storage | null; now?: Date }
): MassActionResult {
  const okIds: string[] = [];
  const skippedIds: string[] = [];
  const errorIds: { invoiceId: string; error: string }[] = [];
  const status = massActionToStatus(action);
  const seen = new Set<string>();

  for (const rawId of invoiceIds) {
    const invoiceId = rawId?.trim() ?? "";
    if (!invoiceId || seen.has(invoiceId.toLowerCase())) {
      continue;
    }
    seen.add(invoiceId.toLowerCase());

    const storage = options?.storage === undefined ? undefined : options.storage;
    const stored =
      storage === undefined
        ? readPromiseFromStorage(invoiceId)
        : readPromiseFromStorage(invoiceId, storage);
    if (!stored) {
      skippedIds.push(invoiceId);
      continue;
    }

    const result = updatePromiseStatus(invoiceId, status, {
      storage: options?.storage,
      now: options?.now
    });

    if (!result.ok) {
      errorIds.push({ invoiceId, error: result.error });
      continue;
    }
    okIds.push(invoiceId);
  }

  return { okIds, skippedIds, errorIds };
}

/** Re-export filter helper for URL/search parity with follow-ups panel. */
export function filterWorkbenchByPromiseGroup(
  cases: readonly WorkbenchCase[],
  group: PromiseGroupFilter,
  search: string
): WorkbenchCase[] {
  return filterPromiseFollowUps(cases, { group, search }).map(toWorkbenchCase);
}
