import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerLedgerSummaries,
  customerLedgerCurrencyLabel,
  customerLedgerOpenItems,
  filterCustomerLedgerSummaries,
  findCustomerLedgerSummary,
  formatCustomerLedgerAgingBadge,
  matchesCustomerQuery,
  normalizeCounterpartyReference,
  type CustomerLedgerInvoiceLike
} from "./customerLedger.ts";

function issued(
  partial: Partial<CustomerLedgerInvoiceLike> &
    Pick<CustomerLedgerInvoiceLike, "id" | "counterpartyReference" | "documentNumber">
): CustomerLedgerInvoiceLike {
  return {
    currency: "UAH",
    status: "Issued",
    dueDateUtc: null,
    totalAmount: 100,
    issuedAtUtc: "2026-07-01T00:00:00.000Z",
    ...partial
  };
}

describe("normalizeCounterpartyReference / matchesCustomerQuery", () => {
  it("trims counterparty references", () => {
    assert.equal(normalizeCounterpartyReference("  ACME  "), "ACME");
    assert.equal(normalizeCounterpartyReference(null), "");
  });

  it("matches substring query case-insensitively", () => {
    assert.equal(matchesCustomerQuery("Acme Corp", "acme"), true);
    assert.equal(matchesCustomerQuery("Acme Corp", "zzz"), false);
    assert.equal(matchesCustomerQuery("Acme Corp", "  "), true);
  });
});

describe("buildCustomerLedgerSummaries", () => {
  it("groups Issued invoices by exact counterparty and ignores Draft", () => {
    const now = new Date("2026-07-29T12:00:00");
    const summaries = buildCustomerLedgerSummaries(
      [
        issued({
          id: "i1",
          counterpartyReference: "ACME",
          documentNumber: "INV-1",
          totalAmount: 200,
          dueDateUtc: "2026-07-20T00:00:00.000Z"
        }),
        issued({
          id: "i2",
          counterpartyReference: "ACME",
          documentNumber: "INV-2",
          totalAmount: 50,
          dueDateUtc: "2026-07-29T00:00:00.000Z"
        }),
        issued({
          id: "i3",
          counterpartyReference: "BETA",
          documentNumber: "INV-3",
          totalAmount: 10,
          dueDateUtc: "2026-08-01T00:00:00.000Z"
        }),
        {
          id: "i4",
          counterpartyReference: "ACME",
          documentNumber: "INV-4",
          currency: "UAH",
          status: "Draft",
          dueDateUtc: "2026-07-01T00:00:00.000Z",
          totalAmount: 999
        }
      ],
      now
    );

    assert.equal(summaries.length, 2);
    const acme = findCustomerLedgerSummary(summaries, "ACME");
    assert.ok(acme);
    assert.equal(acme.invoiceCount, 2);
    assert.equal(acme.totalAmount, 250);
    assert.equal(acme.overdueCount, 1);
    assert.equal(acme.dueTodayCount, 1);
    assert.equal(acme.worstAgingKind, "overdue");
    assert.equal(acme.maxOverdueDays, 9);
    assert.equal(summaries[0]!.counterpartyReference, "ACME");
  });
});

describe("filterCustomerLedgerSummaries", () => {
  it("filters by query and aging bucket", () => {
    const now = new Date("2026-07-29T12:00:00");
    const invoices: CustomerLedgerInvoiceLike[] = [
      issued({
        id: "i1",
        counterpartyReference: "ACME",
        documentNumber: "INV-1",
        dueDateUtc: "2026-07-20T00:00:00.000Z",
        totalAmount: 100
      }),
      issued({
        id: "i2",
        counterpartyReference: "BETA",
        documentNumber: "INV-2",
        dueDateUtc: "2026-08-10T00:00:00.000Z",
        totalAmount: 100
      })
    ];
    const summaries = buildCustomerLedgerSummaries(invoices, now);

    const byQuery = filterCustomerLedgerSummaries(
      summaries,
      invoices,
      { query: "be", agingBucket: "" },
      now
    );
    assert.deepEqual(
      byQuery.map((row) => row.counterpartyReference),
      ["BETA"]
    );

    const byAging = filterCustomerLedgerSummaries(
      summaries,
      invoices,
      { query: "", agingBucket: "1-7" },
      now
    );
    assert.deepEqual(
      byAging.map((row) => row.counterpartyReference),
      []
    );

    const byAging8 = filterCustomerLedgerSummaries(
      summaries,
      invoices,
      { query: "", agingBucket: "8-30" },
      now
    );
    assert.deepEqual(
      byAging8.map((row) => row.counterpartyReference),
      ["ACME"]
    );
  });
});

describe("customerLedgerOpenItems", () => {
  it("returns due-date sorted open items for one counterparty", () => {
    const now = new Date("2026-07-29T12:00:00");
    const items = customerLedgerOpenItems(
      [
        issued({
          id: "i1",
          counterpartyReference: "ACME",
          documentNumber: "INV-B",
          dueDateUtc: "2026-07-28T00:00:00.000Z",
          totalAmount: 10
        }),
        issued({
          id: "i2",
          counterpartyReference: "ACME",
          documentNumber: "INV-A",
          dueDateUtc: "2026-07-10T00:00:00.000Z",
          totalAmount: 20
        }),
        issued({
          id: "i3",
          counterpartyReference: "OTHER",
          documentNumber: "INV-X",
          dueDateUtc: "2026-07-01T00:00:00.000Z",
          totalAmount: 99
        })
      ],
      "ACME",
      "",
      now
    );

    assert.deepEqual(
      items.map((row) => row.id),
      ["i2", "i1"]
    );
  });
});

describe("formatCustomerLedgerAgingBadge / currency label", () => {
  it("formats badges and multi-currency labels", () => {
    assert.equal(
      formatCustomerLedgerAgingBadge({
        worstAgingKind: "overdue",
        maxOverdueDays: 3,
        dueTodayCount: 0
      }),
      "Прострочено · 3 днів"
    );
    assert.equal(customerLedgerCurrencyLabel(["UAH"]), "UAH");
    assert.equal(customerLedgerCurrencyLabel(["EUR", "UAH"]), "EUR · UAH");
  });
});
