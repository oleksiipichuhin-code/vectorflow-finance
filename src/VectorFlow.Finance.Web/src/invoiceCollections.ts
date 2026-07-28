/**
 * Payment collection workspace helpers.
 * Attention set = Issued invoices that are overdue or due today (calendar due-date aging only —
 * never payment/settlement status). Amounts are invoice totals from the API.
 */

import {
  classifyDueDateAging,
  dueDateCalendarString
} from "./invoiceDueDateAging.ts";

export type AgingBucketId = "1-7" | "8-30" | "31-60" | "61-90" | "90+";

/** Empty string = all attention (overdue + due today; no overdue-day bucket filter). */
export type AgingBucketFilter = "" | AgingBucketId;

export const AGING_BUCKET_IDS: readonly AgingBucketId[] = [
  "1-7",
  "8-30",
  "31-60",
  "61-90",
  "90+"
];

export const COLLECTIONS_PAGE_SIZE = 100;

export type AgingBucketOption = {
  id: AgingBucketFilter;
  label: string;
  shortLabel: string;
};

export const AGING_BUCKET_OPTIONS: readonly AgingBucketOption[] = [
  { id: "", label: "Усі до уваги", shortLabel: "Усі" },
  { id: "1-7", label: "1–7 днів прострочки", shortLabel: "1–7" },
  { id: "8-30", label: "8–30 днів прострочки", shortLabel: "8–30" },
  { id: "31-60", label: "31–60 днів прострочки", shortLabel: "31–60" },
  { id: "61-90", label: "61–90 днів прострочки", shortLabel: "61–90" },
  { id: "90+", label: "90+ днів прострочки", shortLabel: "90+" }
];

export type CollectionsInvoiceLike = {
  id: string;
  dueDateUtc: string | null;
  totalAmount: number;
  currency: string;
};

/**
 * Map positive overdue day count to a bucket.
 * Boundaries are inclusive on the lower side of each range;
 * 90+ starts at 91 so it does not overlap 61–90.
 */
export function classifyOverdueAgingBucket(daysOverdue: number): AgingBucketId | null {
  if (!Number.isFinite(daysOverdue) || daysOverdue < 1) {
    return null;
  }

  if (daysOverdue <= 7) {
    return "1-7";
  }
  if (daysOverdue <= 30) {
    return "8-30";
  }
  if (daysOverdue <= 60) {
    return "31-60";
  }
  if (daysOverdue <= 90) {
    return "61-90";
  }
  return "90+";
}

export function parseAgingBucketParam(value: string | null | undefined): AgingBucketFilter {
  if (value == null) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return (AGING_BUCKET_IDS as readonly string[]).includes(trimmed)
    ? (trimmed as AgingBucketId)
    : "";
}

export function agingBucketLabel(bucket: AgingBucketFilter): string {
  const found = AGING_BUCKET_OPTIONS.find((option) => option.id === bucket);
  return found?.label ?? "Усі до уваги";
}

export function overdueDaysForInvoice(
  invoice: Pick<CollectionsInvoiceLike, "dueDateUtc">,
  now: Date = new Date()
): number | null {
  const aging = classifyDueDateAging(invoice.dueDateUtc, now);
  if (aging.kind !== "overdue" || aging.dayOffset == null) {
    return null;
  }
  return aging.dayOffset;
}

export function isDueTodayInvoice(
  invoice: Pick<CollectionsInvoiceLike, "dueDateUtc">,
  now: Date = new Date()
): boolean {
  return classifyDueDateAging(invoice.dueDateUtc, now).kind === "due_today";
}

export function isCollectionsAttentionInvoice(
  invoice: Pick<CollectionsInvoiceLike, "dueDateUtc">,
  now: Date = new Date()
): boolean {
  const kind = classifyDueDateAging(invoice.dueDateUtc, now).kind;
  return kind === "overdue" || kind === "due_today";
}

export function agingBucketForInvoice(
  invoice: Pick<CollectionsInvoiceLike, "dueDateUtc">,
  now: Date = new Date()
): AgingBucketId | null {
  const days = overdueDaysForInvoice(invoice, now);
  if (days == null) {
    return null;
  }
  return classifyOverdueAgingBucket(days);
}

export function invoiceMatchesAgingBucket(
  invoice: Pick<CollectionsInvoiceLike, "dueDateUtc">,
  bucket: AgingBucketFilter,
  now: Date = new Date()
): boolean {
  const invoiceBucket = agingBucketForInvoice(invoice, now);
  if (invoiceBucket == null) {
    return false;
  }
  if (!bucket) {
    return true;
  }
  return invoiceBucket === bucket;
}

/**
 * Payment collection list membership.
 * Empty bucket = all attention (overdue + due today).
 * Non-empty bucket = overdue days only (due today excluded).
 */
export function invoiceMatchesCollectionsQueue(
  invoice: Pick<CollectionsInvoiceLike, "dueDateUtc">,
  bucket: AgingBucketFilter,
  now: Date = new Date()
): boolean {
  if (!bucket) {
    return isCollectionsAttentionInvoice(invoice, now);
  }
  return invoiceMatchesAgingBucket(invoice, bucket, now);
}

/**
 * Priority: overdue before due today → more overdue days → higher totalAmount →
 * earlier due calendar day → id.
 */
export function compareCollectionsPriority(
  a: CollectionsInvoiceLike,
  b: CollectionsInvoiceLike,
  now: Date = new Date()
): number {
  const daysA = overdueDaysForInvoice(a, now);
  const daysB = overdueDaysForInvoice(b, now);
  const overdueA = daysA != null;
  const overdueB = daysB != null;

  if (overdueA !== overdueB) {
    return overdueA ? -1 : 1;
  }

  if (overdueA && overdueB && daysA !== daysB) {
    return (daysB as number) - (daysA as number);
  }

  if (a.totalAmount !== b.totalAmount) {
    return b.totalAmount - a.totalAmount;
  }

  const dueA = dueDateCalendarString(a.dueDateUtc) ?? "";
  const dueB = dueDateCalendarString(b.dueDateUtc) ?? "";
  if (dueA !== dueB) {
    return dueA < dueB ? -1 : 1;
  }

  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

export function buildCollectionsQueue<T extends CollectionsInvoiceLike>(
  invoices: readonly T[],
  bucket: AgingBucketFilter = "",
  now: Date = new Date()
): T[] {
  return invoices
    .filter((invoice) => invoiceMatchesCollectionsQueue(invoice, bucket, now))
    .slice()
    .sort((a, b) => compareCollectionsPriority(a, b, now));
}

export type CurrencyTotal = {
  currency: string;
  amount: number;
};

export type CollectionsSummary = {
  overdueCount: number;
  dueTodayCount: number;
  attentionCount: number;
  bucketCount: number;
  bucket: AgingBucketFilter;
  bucketLabel: string;
  oldestDaysOverdue: number | null;
  overdueTotalsByCurrency: CurrencyTotal[];
  dueTodayTotalsByCurrency: CurrencyTotal[];
  outstandingTotalsByCurrency: CurrencyTotal[];
  /** @deprecated Prefer outstandingTotalsByCurrency (bucket view totals). */
  totalsByCurrency: CurrencyTotal[];
};

function totalsByCurrencyFor(
  invoices: readonly CollectionsInvoiceLike[]
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    const code = invoice.currency?.trim() || "—";
    totals.set(code, (totals.get(code) ?? 0) + invoice.totalAmount);
  }

  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function buildCollectionsSummary(
  invoices: readonly CollectionsInvoiceLike[],
  bucket: AgingBucketFilter = "",
  now: Date = new Date()
): CollectionsSummary {
  const overdueOnly = invoices.filter((invoice) => overdueDaysForInvoice(invoice, now) != null);
  const dueTodayOnly = invoices.filter((invoice) => isDueTodayInvoice(invoice, now));
  const attention = invoices.filter((invoice) => isCollectionsAttentionInvoice(invoice, now));
  const queue = buildCollectionsQueue(attention, bucket, now);

  let oldest: number | null = null;
  for (const invoice of overdueOnly) {
    const days = overdueDaysForInvoice(invoice, now);
    if (days == null) {
      continue;
    }
    if (oldest == null || days > oldest) {
      oldest = days;
    }
  }

  const outstandingTotalsByCurrency = totalsByCurrencyFor(queue);

  return {
    overdueCount: overdueOnly.length,
    dueTodayCount: dueTodayOnly.length,
    attentionCount: attention.length,
    bucketCount: queue.length,
    bucket,
    bucketLabel: agingBucketLabel(bucket),
    oldestDaysOverdue: oldest,
    overdueTotalsByCurrency: totalsByCurrencyFor(overdueOnly),
    dueTodayTotalsByCurrency: totalsByCurrencyFor(dueTodayOnly),
    outstandingTotalsByCurrency,
    totalsByCurrency: outstandingTotalsByCurrency
  };
}

export type CollectionsPosition = {
  index: number;
  total: number;
  label: string;
  nextId: string | null;
  isLast: boolean;
};

export function collectionsQueuePosition(
  orderedIds: readonly string[],
  currentId: string | null | undefined
): CollectionsPosition | null {
  if (!currentId || orderedIds.length === 0) {
    return null;
  }

  const index = orderedIds.indexOf(currentId);
  if (index < 0) {
    return null;
  }

  const total = orderedIds.length;
  const isLast = index >= total - 1;
  return {
    index: index + 1,
    total,
    label: `${index + 1} з ${total}`,
    nextId: isLast ? null : orderedIds[index + 1]!,
    isLast
  };
}
