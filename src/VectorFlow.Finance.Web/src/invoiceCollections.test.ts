import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agingBucketForInvoice,
  buildCollectionsQueue,
  buildCollectionsSummary,
  classifyOverdueAgingBucket,
  collectionsQueuePosition,
  compareCollectionsPriority,
  invoiceMatchesAgingBucket,
  invoiceMatchesCollectionsQueue,
  parseAgingBucketParam,
  type CollectionsInvoiceLike
} from "./invoiceCollections.ts";

function invoice(
  partial: Partial<CollectionsInvoiceLike> & Pick<CollectionsInvoiceLike, "id" | "dueDateUtc">
): CollectionsInvoiceLike {
  return {
    totalAmount: 100,
    currency: "UAH",
    ...partial
  };
}

describe("classifyOverdueAgingBucket boundaries", () => {
  it("rejects non-overdue day counts", () => {
    assert.equal(classifyOverdueAgingBucket(0), null);
    assert.equal(classifyOverdueAgingBucket(-1), null);
  });

  it("places day 1 and 7 in 1-7", () => {
    assert.equal(classifyOverdueAgingBucket(1), "1-7");
    assert.equal(classifyOverdueAgingBucket(7), "1-7");
  });

  it("places day 8 and 30 in 8-30", () => {
    assert.equal(classifyOverdueAgingBucket(8), "8-30");
    assert.equal(classifyOverdueAgingBucket(30), "8-30");
  });

  it("places day 31 and 60 in 31-60", () => {
    assert.equal(classifyOverdueAgingBucket(31), "31-60");
    assert.equal(classifyOverdueAgingBucket(60), "31-60");
  });

  it("places day 61 and 90 in 61-90", () => {
    assert.equal(classifyOverdueAgingBucket(61), "61-90");
    assert.equal(classifyOverdueAgingBucket(90), "61-90");
  });

  it("places day 91+ in 90+", () => {
    assert.equal(classifyOverdueAgingBucket(91), "90+");
    assert.equal(classifyOverdueAgingBucket(120), "90+");
  });
});

describe("parseAgingBucketParam", () => {
  it("accepts known buckets and ignores invalid values", () => {
    assert.equal(parseAgingBucketParam("1-7"), "1-7");
    assert.equal(parseAgingBucketParam("90+"), "90+");
    assert.equal(parseAgingBucketParam("all"), "");
    assert.equal(parseAgingBucketParam("paid"), "");
    assert.equal(parseAgingBucketParam(null), "");
    assert.equal(parseAgingBucketParam(" 8-30 "), "8-30");
  });
});

describe("invoice aging bucket from due dates", () => {
  const now = new Date(2026, 6, 28, 12, 0, 0); // local 28 Jul 2026

  it("maps calendar overdue days without timezone off-by-one", () => {
    // Due 27 Jul → 1 day overdue on 28 Jul
    assert.equal(
      agingBucketForInvoice(invoice({ id: "a", dueDateUtc: "2026-07-27T00:00:00.000Z" }), now),
      "1-7"
    );
    // Due 21 Jul → 7 days
    assert.equal(
      agingBucketForInvoice(invoice({ id: "b", dueDateUtc: "2026-07-21T00:00:00.000Z" }), now),
      "1-7"
    );
    // Due 20 Jul → 8 days
    assert.equal(
      agingBucketForInvoice(invoice({ id: "c", dueDateUtc: "2026-07-20T00:00:00.000Z" }), now),
      "8-30"
    );
    // Due today is not overdue
    assert.equal(
      agingBucketForInvoice(invoice({ id: "d", dueDateUtc: "2026-07-28T00:00:00.000Z" }), now),
      null
    );
  });

  it("filters by selected bucket", () => {
    const row = invoice({ id: "x", dueDateUtc: "2026-07-20T00:00:00.000Z" });
    assert.equal(invoiceMatchesAgingBucket(row, "", now), true);
    assert.equal(invoiceMatchesAgingBucket(row, "8-30", now), true);
    assert.equal(invoiceMatchesAgingBucket(row, "1-7", now), false);
  });

  it("includes due today only when aging bucket is all attention", () => {
    const dueToday = invoice({ id: "t", dueDateUtc: "2026-07-28T00:00:00.000Z" });
    assert.equal(invoiceMatchesCollectionsQueue(dueToday, "", now), true);
    assert.equal(invoiceMatchesCollectionsQueue(dueToday, "1-7", now), false);
  });
});

describe("collections priority sort", () => {
  const now = new Date(2026, 6, 28, 9, 0, 0);

  it("orders by overdue days, then amount, then due date, then id", () => {
    const rows = [
      invoice({
        id: "b",
        dueDateUtc: "2026-07-20T00:00:00.000Z",
        totalAmount: 50
      }),
      invoice({
        id: "a",
        dueDateUtc: "2026-07-10T00:00:00.000Z",
        totalAmount: 50
      }),
      invoice({
        id: "c",
        dueDateUtc: "2026-07-20T00:00:00.000Z",
        totalAmount: 200
      }),
      invoice({
        id: "d",
        dueDateUtc: "2026-07-21T00:00:00.000Z",
        totalAmount: 200
      })
    ];

    const ordered = buildCollectionsQueue(rows, "", now).map((row) => row.id);
    // a: 18 days; c: 8 days / 200; b: 8 days / 50; d: 7 days / 200
    assert.deepEqual(ordered, ["a", "c", "b", "d"]);
  });

  it("places overdue before due today", () => {
    const rows = [
      invoice({ id: "today", dueDateUtc: "2026-07-28T00:00:00.000Z", totalAmount: 999 }),
      invoice({ id: "over", dueDateUtc: "2026-07-27T00:00:00.000Z", totalAmount: 1 })
    ];
    assert.deepEqual(
      buildCollectionsQueue(rows, "", now).map((row) => row.id),
      ["over", "today"]
    );
  });

  it("compare is stable for identical priority keys except id", () => {
    const a = invoice({
      id: "aaa",
      dueDateUtc: "2026-07-01T00:00:00.000Z",
      totalAmount: 10
    });
    const b = invoice({
      id: "bbb",
      dueDateUtc: "2026-07-01T00:00:00.000Z",
      totalAmount: 10
    });
    assert.ok(compareCollectionsPriority(a, b, now) < 0);
    assert.ok(compareCollectionsPriority(b, a, now) > 0);
  });
});

describe("collections summary and next position", () => {
  const now = new Date(2026, 6, 28, 15, 0, 0);

  it("summarizes overdue, due today, and outstanding amounts", () => {
    const rows = [
      invoice({ id: "1", dueDateUtc: "2026-07-27T00:00:00.000Z", totalAmount: 10, currency: "UAH" }),
      invoice({ id: "2", dueDateUtc: "2026-07-01T00:00:00.000Z", totalAmount: 40, currency: "UAH" }),
      invoice({ id: "3", dueDateUtc: "2026-07-20T00:00:00.000Z", totalAmount: 5, currency: "EUR" }),
      invoice({ id: "4", dueDateUtc: "2026-07-28T00:00:00.000Z", totalAmount: 25, currency: "UAH" }),
      invoice({ id: "5", dueDateUtc: "2026-07-30T00:00:00.000Z", totalAmount: 100, currency: "UAH" })
    ];

    const all = buildCollectionsSummary(rows, "", now);
    assert.equal(all.overdueCount, 3);
    assert.equal(all.dueTodayCount, 1);
    assert.equal(all.attentionCount, 4);
    assert.equal(all.bucketCount, 4);
    assert.equal(all.oldestDaysOverdue, 27);
    assert.equal(all.overdueTotalsByCurrency.find((row) => row.currency === "UAH")?.amount, 50);
    assert.equal(all.dueTodayTotalsByCurrency[0]?.amount, 25);
    assert.equal(all.outstandingTotalsByCurrency.find((row) => row.currency === "UAH")?.amount, 75);

    const bucket = buildCollectionsSummary(rows, "1-7", now);
    assert.equal(bucket.bucketCount, 1);
    assert.equal(bucket.dueTodayCount, 1);
    assert.equal(bucket.bucketLabel, "1–7 днів прострочки");
    assert.equal(bucket.outstandingTotalsByCurrency[0]?.amount, 10);
  });

  it("resolves next invoice inside the current ordered queue", () => {
    const pos = collectionsQueuePosition(["a", "b", "c"], "b");
    assert.deepEqual(pos, {
      index: 2,
      total: 3,
      label: "2 з 3",
      nextId: "c",
      isLast: false
    });

    const last = collectionsQueuePosition(["a", "b", "c"], "c");
    assert.equal(last?.nextId, null);
    assert.equal(last?.isLast, true);
    assert.equal(collectionsQueuePosition(["a"], "z"), null);
  });
});
