/**
 * Overdue-queue settlement visibility.
 * Calendar due-date aging still defines attention membership; local collection-case
 * resolution (paid / completed follow-up) decides whether an invoice remains in the
 * active open queue or is treated as settled for collector attention.
 */

import i18n from "./i18n/index.ts";
import {
  buildCollectionsQueue,
  buildCollectionsSummary,
  type AgingBucketFilter,
  type CollectionsInvoiceLike,
  type CollectionsSummary,
  type CurrencyTotal
} from "./invoiceCollections.ts";
import type {
  CollectionResolution,
  PromiseFollowUpStatus,
  PromiseToPayRecord
} from "./promiseToPay.ts";

export type CollectionQueueSettlementState = "open" | "settled";

export type CollectionCaseSettlementLike = {
  status: PromiseFollowUpStatus;
  resolution: CollectionResolution | null;
};

export type CollectionQueueSettlementInfo = {
  state: CollectionQueueSettlementState;
  label: string | null;
  openAmount: number;
  isPartial: boolean;
};

/**
 * Terminal collection settlement for queue attention.
 * Paid resolution or completed follow-up status removes the invoice from the open queue.
 * Partially paid and other operational resolutions stay open.
 */
export function isCollectionQueueSettled(
  record: CollectionCaseSettlementLike | null | undefined
): boolean {
  if (!record) {
    return false;
  }
  if (record.resolution?.kind === "paid") {
    return true;
  }
  return record.status === "completed";
}

export function collectionQueueSettlementLabel(
  record: CollectionCaseSettlementLike | null | undefined
): string | null {
  if (!record) {
    return null;
  }
  if (record.resolution?.kind === "paid") {
    return i18n.t("collections.settlement.paid", { ns: "finance" });
  }
  if (record.status === "completed") {
    return i18n.t("collections.settlement.completed", { ns: "finance" });
  }
  if (record.resolution?.kind === "partially_paid") {
    return i18n.t("collections.settlement.partial", { ns: "finance" });
  }
  return null;
}

/** Open amount for queue KPIs: remaining after partial payment, else invoice total. */
export function collectionQueueOpenAmount(
  invoice: Pick<CollectionsInvoiceLike, "totalAmount">,
  record: CollectionCaseSettlementLike | null | undefined
): number {
  if (
    record?.resolution?.kind === "partially_paid" &&
    record.resolution.remainingAmount != null &&
    Number.isFinite(record.resolution.remainingAmount)
  ) {
    return record.resolution.remainingAmount;
  }
  return invoice.totalAmount;
}

export function resolveCollectionQueueSettlement(
  invoice: Pick<CollectionsInvoiceLike, "totalAmount">,
  record: CollectionCaseSettlementLike | null | undefined
): CollectionQueueSettlementInfo {
  const settled = isCollectionQueueSettled(record);
  return {
    state: settled ? "settled" : "open",
    label: collectionQueueSettlementLabel(record),
    openAmount: settled ? 0 : collectionQueueOpenAmount(invoice, record),
    isPartial: record?.resolution?.kind === "partially_paid" && !settled
  };
}

/**
 * URL `queueShowSettled=1` includes settled invoices in the overdue queue table.
 * Missing/invalid → false (hide settled by default).
 */
export function parseQueueShowSettledParam(
  value: string | null | undefined
): boolean {
  if (value == null) {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true" || trimmed === "yes";
}

export function recordsByInvoiceId(
  records: readonly PromiseToPayRecord[]
): Map<string, PromiseToPayRecord> {
  const map = new Map<string, PromiseToPayRecord>();
  for (const record of records) {
    map.set(record.invoiceId, record);
  }
  return map;
}

export function filterCollectionsQueueBySettlement<T extends CollectionsInvoiceLike>(
  queue: readonly T[],
  recordsById: ReadonlyMap<string, CollectionCaseSettlementLike>,
  options: { hideSettled?: boolean } = {}
): T[] {
  const hideSettled = options.hideSettled !== false;
  if (!hideSettled) {
    return queue.slice();
  }
  return queue.filter((invoice) => !isCollectionQueueSettled(recordsById.get(invoice.id)));
}

function totalsByCurrencyForAmounts(
  rows: readonly { currency: string; amount: number }[]
): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const code = row.currency?.trim() || "—";
    totals.set(code, (totals.get(code) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export type SettlementAwareCollectionsSummary = CollectionsSummary & {
  openCount: number;
  settledCount: number;
  openTotalsByCurrency: CurrencyTotal[];
  settledTotalsByCurrency: CurrencyTotal[];
  hideSettled: boolean;
};

/**
 * Builds calendar attention summary, then splits open vs settled using local cases.
 * When hideSettled is true, bucketCount / outstandingTotals reflect the open queue only.
 */
export function buildSettlementAwareCollectionsSummary(
  invoices: readonly CollectionsInvoiceLike[],
  recordsById: ReadonlyMap<string, CollectionCaseSettlementLike>,
  bucket: AgingBucketFilter = "",
  now: Date = new Date(),
  options: { hideSettled?: boolean } = {}
): SettlementAwareCollectionsSummary {
  const hideSettled = options.hideSettled !== false;
  const base = buildCollectionsSummary(invoices, bucket, now);
  const calendarQueue = buildCollectionsQueue(invoices, bucket, now);

  const openRows: CollectionsInvoiceLike[] = [];
  const settledRows: CollectionsInvoiceLike[] = [];
  const openAmountRows: { currency: string; amount: number }[] = [];
  const settledAmountRows: { currency: string; amount: number }[] = [];

  for (const invoice of calendarQueue) {
    const record = recordsById.get(invoice.id);
    const settlement = resolveCollectionQueueSettlement(invoice, record);
    if (settlement.state === "settled") {
      settledRows.push(invoice);
      settledAmountRows.push({
        currency: invoice.currency,
        amount: invoice.totalAmount
      });
    } else {
      openRows.push(invoice);
      openAmountRows.push({
        currency: invoice.currency,
        amount: settlement.openAmount
      });
    }
  }

  const visible = hideSettled ? openRows : calendarQueue;
  const outstandingTotalsByCurrency = hideSettled
    ? totalsByCurrencyForAmounts(openAmountRows)
    : totalsByCurrencyForAmounts([
        ...openAmountRows,
        ...settledAmountRows
      ]);

  return {
    ...base,
    bucketCount: visible.length,
    outstandingTotalsByCurrency,
    totalsByCurrency: outstandingTotalsByCurrency,
    openCount: openRows.length,
    settledCount: settledRows.length,
    openTotalsByCurrency: totalsByCurrencyForAmounts(openAmountRows),
    settledTotalsByCurrency: totalsByCurrencyForAmounts(settledAmountRows),
    hideSettled
  };
}
