import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSettlementAwareCollectionsSummary,
  collectionQueueOpenAmount,
  collectionQueueSettlementLabel,
  filterCollectionsQueueBySettlement,
  isCollectionQueueSettled,
  parseQueueShowSettledParam,
  recordsByInvoiceId,
  resolveCollectionQueueSettlement
} from "./collectionQueueSettlement.ts";
import i18n from "./i18n/index.ts";
import type { CollectionsInvoiceLike } from "./invoiceCollections.ts";
import type { PromiseToPayRecord } from "./promiseToPay.ts";

function invoice(
  partial: Partial<CollectionsInvoiceLike> & Pick<CollectionsInvoiceLike, "id" | "dueDateUtc">
): CollectionsInvoiceLike {
  return {
    totalAmount: 100,
    currency: "UAH",
    ...partial
  };
}

function record(
  partial: Partial<PromiseToPayRecord> & Pick<PromiseToPayRecord, "invoiceId">
): PromiseToPayRecord {
  return {
    promiseDate: "2026-07-20",
    note: "",
    status: "awaiting",
    updatedAtUtc: "2026-07-20T10:00:00.000Z",
    completedAtUtc: null,
    resolution: null,
    nextFollowUpAt: null,
    lastContact: null,
    dispute: null,
    escalation: null,
    paymentPlan: null,
    notes: [],
    reminders: [],
    attachments: [],
    history: [],
    ...partial
  };
}

describe("collection queue settlement classification", () => {
  it("treats paid resolution and completed status as settled", () => {
    assert.equal(isCollectionQueueSettled(null), false);
    assert.equal(
      isCollectionQueueSettled(record({ invoiceId: "a", status: "awaiting" })),
      false
    );
    assert.equal(
      isCollectionQueueSettled(
        record({
          invoiceId: "b",
          status: "completed",
          completedAtUtc: "2026-07-28T12:00:00.000Z",
          resolution: {
            kind: "paid",
            resolvedAtUtc: "2026-07-28T12:00:00.000Z",
            paymentDate: "2026-07-28",
            paidAmount: null,
            remainingAmount: 0,
            reason: null,
            note: ""
          }
        })
      ),
      true
    );
    assert.equal(
      isCollectionQueueSettled(
        record({
          invoiceId: "c",
          status: "completed",
          completedAtUtc: "2026-07-28T12:00:00.000Z"
        })
      ),
      true
    );
    assert.equal(
      isCollectionQueueSettled(
        record({
          invoiceId: "d",
          status: "awaiting",
          resolution: {
            kind: "partially_paid",
            resolvedAtUtc: "2026-07-28T12:00:00.000Z",
            paymentDate: "2026-07-28",
            paidAmount: 40,
            remainingAmount: 60,
            reason: null,
            note: ""
          }
        })
      ),
      false
    );
  });

  it("labels settlement and uses remaining amount for partial payments", () => {
    const partial = record({
      invoiceId: "p",
      resolution: {
        kind: "partially_paid",
        resolvedAtUtc: "2026-07-28T12:00:00.000Z",
        paymentDate: "2026-07-28",
        paidAmount: 25,
        remainingAmount: 75,
        reason: null,
        note: ""
      }
    });
    assert.equal(
      collectionQueueSettlementLabel(partial),
      i18n.t("collections.settlement.partial", { ns: "finance" })
    );
    assert.equal(collectionQueueOpenAmount(invoice({ id: "p", dueDateUtc: null }), partial), 75);

    const paid = record({
      invoiceId: "paid",
      status: "completed",
      resolution: {
        kind: "paid",
        resolvedAtUtc: "2026-07-28T12:00:00.000Z",
        paymentDate: "2026-07-28",
        paidAmount: null,
        remainingAmount: 0,
        reason: null,
        note: ""
      }
    });
    assert.equal(
      collectionQueueSettlementLabel(paid),
      i18n.t("collections.settlement.paid", { ns: "finance" })
    );
    const info = resolveCollectionQueueSettlement(
      invoice({ id: "paid", dueDateUtc: null, totalAmount: 100 }),
      paid
    );
    assert.equal(info.state, "settled");
    assert.equal(info.openAmount, 0);
  });
});

describe("parseQueueShowSettledParam", () => {
  it("accepts truthy flags and defaults to false", () => {
    assert.equal(parseQueueShowSettledParam(null), false);
    assert.equal(parseQueueShowSettledParam(""), false);
    assert.equal(parseQueueShowSettledParam("0"), false);
    assert.equal(parseQueueShowSettledParam("1"), true);
    assert.equal(parseQueueShowSettledParam("true"), true);
    assert.equal(parseQueueShowSettledParam("YES"), true);
  });
});

describe("filter and settlement-aware summary", () => {
  const now = new Date(2026, 6, 28, 12, 0, 0);

  it("hides settled invoices from the open queue by default", () => {
    const rows = [
      invoice({ id: "open", dueDateUtc: "2026-07-20T00:00:00.000Z", totalAmount: 50 }),
      invoice({ id: "paid", dueDateUtc: "2026-07-10T00:00:00.000Z", totalAmount: 80 }),
      invoice({ id: "today", dueDateUtc: "2026-07-28T00:00:00.000Z", totalAmount: 20 })
    ];
    const byId = recordsByInvoiceId([
      record({
        invoiceId: "paid",
        status: "completed",
        completedAtUtc: "2026-07-28T10:00:00.000Z",
        resolution: {
          kind: "paid",
          resolvedAtUtc: "2026-07-28T10:00:00.000Z",
          paymentDate: "2026-07-28",
          paidAmount: null,
          remainingAmount: 0,
          reason: null,
          note: "done"
        }
      })
    ]);

    const hidden = filterCollectionsQueueBySettlement(rows, byId, { hideSettled: true });
    assert.deepEqual(
      hidden.map((row) => row.id),
      ["open", "today"]
    );

    const shown = filterCollectionsQueueBySettlement(rows, byId, { hideSettled: false });
    assert.deepEqual(
      shown.map((row) => row.id),
      ["open", "paid", "today"]
    );
  });

  it("summarizes open versus settled attention and open amounts", () => {
    const rows = [
      invoice({
        id: "open",
        dueDateUtc: "2026-07-20T00:00:00.000Z",
        totalAmount: 100,
        currency: "UAH"
      }),
      invoice({
        id: "partial",
        dueDateUtc: "2026-07-15T00:00:00.000Z",
        totalAmount: 100,
        currency: "UAH"
      }),
      invoice({
        id: "paid",
        dueDateUtc: "2026-07-01T00:00:00.000Z",
        totalAmount: 40,
        currency: "UAH"
      }),
      invoice({
        id: "future",
        dueDateUtc: "2026-07-30T00:00:00.000Z",
        totalAmount: 10,
        currency: "UAH"
      })
    ];
    const byId = recordsByInvoiceId([
      record({
        invoiceId: "partial",
        resolution: {
          kind: "partially_paid",
          resolvedAtUtc: "2026-07-28T09:00:00.000Z",
          paymentDate: "2026-07-28",
          paidAmount: 30,
          remainingAmount: 70,
          reason: null,
          note: ""
        }
      }),
      record({
        invoiceId: "paid",
        status: "completed",
        completedAtUtc: "2026-07-28T09:00:00.000Z",
        resolution: {
          kind: "paid",
          resolvedAtUtc: "2026-07-28T09:00:00.000Z",
          paymentDate: "2026-07-28",
          paidAmount: null,
          remainingAmount: 0,
          reason: null,
          note: ""
        }
      })
    ]);

    const summary = buildSettlementAwareCollectionsSummary(rows, byId, "", now, {
      hideSettled: true
    });
    assert.equal(summary.attentionCount, 3);
    assert.equal(summary.openCount, 2);
    assert.equal(summary.settledCount, 1);
    assert.equal(summary.bucketCount, 2);
    assert.equal(summary.hideSettled, true);
    assert.equal(summary.openTotalsByCurrency[0]?.amount, 170);
    assert.equal(summary.settledTotalsByCurrency[0]?.amount, 40);
    assert.equal(summary.outstandingTotalsByCurrency[0]?.amount, 170);

    const withSettled = buildSettlementAwareCollectionsSummary(rows, byId, "", now, {
      hideSettled: false
    });
    assert.equal(withSettled.bucketCount, 3);
    assert.equal(withSettled.outstandingTotalsByCurrency[0]?.amount, 210);
  });
});
