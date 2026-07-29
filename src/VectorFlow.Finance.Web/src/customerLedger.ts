/**
 * Customer ledger (AR by counterparty) helpers.
 * Groups Issued invoices by exact counterpartyReference; aging is due-date only
 * (no payment/settlement status — payments remain a later slice).
 */

import {
  agingBucketForInvoice,
  type AgingBucketFilter,
  type CollectionsInvoiceLike
} from "./invoiceCollections.ts";
import {
  classifyDueDateAging,
  type DueDateAgingKind
} from "./invoiceDueDateAging.ts";

/** Same fetch ceiling as payment collections (API pageSize max for workspace lists). */
export const CUSTOMER_LEDGER_PAGE_SIZE = 100;

export type CustomerLedgerInvoiceLike = CollectionsInvoiceLike & {
  documentNumber: string;
  counterpartyReference: string;
  status: string;
  issuedAtUtc?: string | null;
};

export type CustomerLedgerSummary = {
  counterpartyReference: string;
  invoiceCount: number;
  totalAmount: number;
  /** Distinct currencies among open items (sorted). */
  currencies: string[];
  overdueCount: number;
  dueTodayCount: number;
  notDueYetCount: number;
  noDueDateCount: number;
  /** Max overdue days among open items; null when none overdue. */
  maxOverdueDays: number | null;
  /** Worst due-date kind for list badges (overdue > due_today > not_due_yet > no_due_date). */
  worstAgingKind: DueDateAgingKind;
};

export type CustomerLedgerListFilters = {
  /** Case-insensitive substring over counterpartyReference. */
  query: string;
  /** Empty = all customers; otherwise customers with ≥1 invoice in the overdue bucket. */
  agingBucket: AgingBucketFilter;
};

export const EMPTY_CUSTOMER_LEDGER_FILTERS: CustomerLedgerListFilters = {
  query: "",
  agingBucket: ""
};

const AGING_KIND_RANK: Record<DueDateAgingKind, number> = {
  overdue: 4,
  due_today: 3,
  not_due_yet: 2,
  no_due_date: 1
};

/** Normalize counterparty for exact URL / API match. */
export function normalizeCounterpartyReference(
  value: string | null | undefined
): string {
  if (value == null) {
    return "";
  }

  return value.trim();
}

export function isIssuedInvoice(
  invoice: Pick<CustomerLedgerInvoiceLike, "status">
): boolean {
  return invoice.status === "Issued";
}

export function matchesCustomerQuery(
  counterpartyReference: string,
  query: string
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return true;
  }

  return counterpartyReference.toLocaleLowerCase().includes(needle);
}

function worseAgingKind(a: DueDateAgingKind, b: DueDateAgingKind): DueDateAgingKind {
  return AGING_KIND_RANK[a] >= AGING_KIND_RANK[b] ? a : b;
}

/**
 * Build one summary row per distinct counterpartyReference (exact string).
 * Only Issued invoices contribute; callers should pass Issued-only lists.
 */
export function buildCustomerLedgerSummaries(
  invoices: ReadonlyArray<CustomerLedgerInvoiceLike>,
  now: Date = new Date()
): CustomerLedgerSummary[] {
  const byCounterparty = new Map<
    string,
    {
      invoices: CustomerLedgerInvoiceLike[];
    }
  >();

  for (const invoice of invoices) {
    if (!isIssuedInvoice(invoice)) {
      continue;
    }

    const key = normalizeCounterpartyReference(invoice.counterpartyReference);
    if (!key) {
      continue;
    }

    const bucket = byCounterparty.get(key);
    if (bucket) {
      bucket.invoices.push(invoice);
    } else {
      byCounterparty.set(key, { invoices: [invoice] });
    }
  }

  const summaries: CustomerLedgerSummary[] = [];

  for (const [counterpartyReference, { invoices: rows }] of byCounterparty) {
    const currencies = new Set<string>();
    let totalAmount = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let notDueYetCount = 0;
    let noDueDateCount = 0;
    let maxOverdueDays: number | null = null;
    let worstAgingKind: DueDateAgingKind = "no_due_date";

    for (const row of rows) {
      totalAmount += Number.isFinite(row.totalAmount) ? row.totalAmount : 0;
      if (row.currency?.trim()) {
        currencies.add(row.currency.trim().toUpperCase());
      }

      const aging = classifyDueDateAging(row.dueDateUtc, now);
      worstAgingKind = worseAgingKind(worstAgingKind, aging.kind);

      if (aging.kind === "overdue") {
        overdueCount += 1;
        if (aging.dayOffset != null) {
          maxOverdueDays =
            maxOverdueDays == null
              ? aging.dayOffset
              : Math.max(maxOverdueDays, aging.dayOffset);
        }
      } else if (aging.kind === "due_today") {
        dueTodayCount += 1;
      } else if (aging.kind === "not_due_yet") {
        notDueYetCount += 1;
      } else {
        noDueDateCount += 1;
      }
    }

    summaries.push({
      counterpartyReference,
      invoiceCount: rows.length,
      totalAmount,
      currencies: [...currencies].sort((a, b) => a.localeCompare(b)),
      overdueCount,
      dueTodayCount,
      notDueYetCount,
      noDueDateCount,
      maxOverdueDays,
      worstAgingKind
    });
  }

  summaries.sort((a, b) => {
    const overdueCmp = b.overdueCount - a.overdueCount;
    if (overdueCmp !== 0) {
      return overdueCmp;
    }

    const dueTodayCmp = b.dueTodayCount - a.dueTodayCount;
    if (dueTodayCmp !== 0) {
      return dueTodayCmp;
    }

    const amountCmp = b.totalAmount - a.totalAmount;
    if (amountCmp !== 0) {
      return amountCmp;
    }

    return a.counterpartyReference.localeCompare(b.counterpartyReference);
  });

  return summaries;
}

function customerHasAgingBucket(
  invoices: ReadonlyArray<CustomerLedgerInvoiceLike>,
  counterpartyReference: string,
  agingBucket: AgingBucketFilter,
  now: Date
): boolean {
  const key = normalizeCounterpartyReference(counterpartyReference);
  if (!key || !agingBucket) {
    return true;
  }

  return invoices.some(
    (invoice) =>
      isIssuedInvoice(invoice) &&
      normalizeCounterpartyReference(invoice.counterpartyReference) === key &&
      agingBucketForInvoice(invoice, now) === agingBucket
  );
}

/**
 * Filter customer summary rows by search query and optional overdue aging bucket.
 */
export function filterCustomerLedgerSummaries(
  summaries: ReadonlyArray<CustomerLedgerSummary>,
  invoices: ReadonlyArray<CustomerLedgerInvoiceLike>,
  filters: CustomerLedgerListFilters,
  now: Date = new Date()
): CustomerLedgerSummary[] {
  const query = filters.query?.trim() ?? "";
  const agingBucket = filters.agingBucket ?? "";

  return summaries.filter((summary) => {
    if (!matchesCustomerQuery(summary.counterpartyReference, query)) {
      return false;
    }

    if (
      agingBucket &&
      !customerHasAgingBucket(
        invoices,
        summary.counterpartyReference,
        agingBucket,
        now
      )
    ) {
      return false;
    }

    return true;
  });
}

/**
 * Open items for one counterparty (exact reference), optional aging bucket, due-date sort.
 */
export function customerLedgerOpenItems(
  invoices: ReadonlyArray<CustomerLedgerInvoiceLike>,
  counterpartyReference: string,
  agingBucket: AgingBucketFilter = "",
  now: Date = new Date()
): CustomerLedgerInvoiceLike[] {
  const key = normalizeCounterpartyReference(counterpartyReference);
  if (!key) {
    return [];
  }

  const items = invoices.filter((invoice) => {
    if (!isIssuedInvoice(invoice)) {
      return false;
    }

    if (normalizeCounterpartyReference(invoice.counterpartyReference) !== key) {
      return false;
    }

    if (agingBucket && agingBucketForInvoice(invoice, now) !== agingBucket) {
      return false;
    }

    return true;
  });

  items.sort((a, b) => {
    const agingA = classifyDueDateAging(a.dueDateUtc, now);
    const agingB = classifyDueDateAging(b.dueDateUtc, now);
    const rankCmp = AGING_KIND_RANK[agingB.kind] - AGING_KIND_RANK[agingA.kind];
    if (rankCmp !== 0) {
      return rankCmp;
    }

    if (agingA.kind === "overdue" && agingB.kind === "overdue") {
      const daysA = agingA.dayOffset ?? 0;
      const daysB = agingB.dayOffset ?? 0;
      if (daysB !== daysA) {
        return daysB - daysA;
      }
    }

    const amountCmp = b.totalAmount - a.totalAmount;
    if (amountCmp !== 0) {
      return amountCmp;
    }

    return a.documentNumber.localeCompare(b.documentNumber);
  });

  return items;
}

export function findCustomerLedgerSummary(
  summaries: ReadonlyArray<CustomerLedgerSummary>,
  counterpartyReference: string
): CustomerLedgerSummary | null {
  const key = normalizeCounterpartyReference(counterpartyReference);
  if (!key) {
    return null;
  }

  return summaries.find((row) => row.counterpartyReference === key) ?? null;
}

export function formatCustomerLedgerAgingBadge(
  summary: Pick<CustomerLedgerSummary, "worstAgingKind" | "maxOverdueDays" | "dueTodayCount">
): string {
  if (summary.worstAgingKind === "overdue") {
    if (summary.maxOverdueDays == null) {
      return "Прострочено";
    }
    if (summary.maxOverdueDays === 1) {
      return "Прострочено · 1 день";
    }
    return `Прострочено · ${summary.maxOverdueDays} днів`;
  }

  if (summary.worstAgingKind === "due_today") {
    return "Строк сьогодні";
  }

  if (summary.worstAgingKind === "not_due_yet") {
    return "Строк не настав";
  }

  return "Немає строку";
}

export function customerLedgerCurrencyLabel(
  currencies: ReadonlyArray<string>,
  fallback = "—"
): string {
  if (currencies.length === 0) {
    return fallback;
  }

  if (currencies.length === 1) {
    return currencies[0]!;
  }

  return currencies.join(" · ");
}
