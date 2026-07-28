import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyWorkbenchMassAction,
  buildWorkbenchCases,
  buildWorkbenchKpi,
  buildWorkbenchSectionSummaries,
  filterWorkbenchCases,
  parseWorkbenchHideCompletedParam,
  parseWorkbenchSectionParam,
  parseWorkbenchSortParam,
  resolveNextBestAction,
  toWorkbenchCase,
  type WorkbenchCase
} from "./collectionWorkbench.ts";
import {
  applyCollectionResolution,
  listPromiseRecordsFromStorage,
  removePromiseFromStorage,
  savePromiseToPay,
  storageKeyForInvoice,
  updatePromiseStatus,
  type PromiseFollowUpItem,
  type PromiseInvoiceLike
} from "./promiseToPay.ts";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const INVOICE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INVOICE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INVOICE_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const INVOICE_D = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const INVOICE_E = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

const NOW = new Date("2026-07-28T12:00:00.000+03:00");

function invoice(
  id: string,
  overrides: Partial<PromiseInvoiceLike> = {}
): PromiseInvoiceLike {
  return {
    id,
    documentNumber: overrides.documentNumber ?? `INV-${id.slice(0, 4)}`,
    counterpartyReference: overrides.counterpartyReference ?? "acme-ua",
    dueDateUtc: overrides.dueDateUtc ?? "2026-07-01T00:00:00.000Z",
    totalAmount: overrides.totalAmount ?? 1000,
    currency: overrides.currency ?? "UAH"
  };
}

function baseItem(
  overrides: Partial<PromiseFollowUpItem> = {}
): PromiseFollowUpItem {
  return {
    invoiceId: INVOICE_A,
    documentNumber: "INV-AAAA",
    counterpartyReference: "acme-ua",
    overdueAmount: 1000,
    currency: "UAH",
    originalDueDate: "2026-07-01",
    promiseDate: "2026-07-28",
    nextActionDate: "2026-07-28",
    daysRelativeToPromise: 0,
    daysRelativeLabel: "сьогодні",
    group: "due_today",
    groupLabel: "Due today",
    status: "awaiting",
    statusLabel: "Очікується",
    note: "",
    completedAtUtc: null,
    resolution: null,
    resolutionLabel: null,
    nextFollowUpAt: null,
    lastContact: null,
    ...overrides
  };
}

describe("collectionWorkbench next best action", () => {
  it("maps deterministic rules by group and resolution", () => {
    assert.equal(
      resolveNextBestAction(baseItem({ group: "broken" })),
      "contact_customer"
    );
    assert.equal(
      resolveNextBestAction(baseItem({ group: "upcoming" })),
      "wait"
    );
    assert.equal(
      resolveNextBestAction(baseItem({ group: "due_today" })),
      "verify_payment"
    );
    assert.equal(
      resolveNextBestAction(baseItem({ group: "escalated" })),
      "review_escalation"
    );
    assert.equal(
      resolveNextBestAction(baseItem({ group: "disputed" })),
      "review_dispute"
    );
    assert.equal(
      resolveNextBestAction(
        baseItem({
          group: "follow_up_required",
          resolution: {
            kind: "unable_to_contact",
            resolvedAtUtc: NOW.toISOString(),
            paymentDate: null,
            paidAmount: null,
            remainingAmount: null,
            reason: null,
            note: ""
          }
        })
      ),
      "retry_contact"
    );
    assert.equal(
      resolveNextBestAction(baseItem({ group: "completed", status: "completed" })),
      "none"
    );
  });
});

describe("collectionWorkbench grouping and KPI", () => {
  it("groups into five workbench sections and builds KPI", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-07-28", note: "due today" },
      { storage, now: NOW }
    );
    savePromiseToPay(
      INVOICE_B,
      { promiseDate: "2026-07-20", note: "broken" },
      { storage, now: NOW }
    );
    savePromiseToPay(
      INVOICE_C,
      { promiseDate: "2026-08-01", note: "escalated" },
      { storage, now: NOW }
    );
    applyCollectionResolution(
      INVOICE_C,
      { kind: "escalated", reason: "manager review" },
      { storage, now: NOW }
    );
    savePromiseToPay(
      INVOICE_D,
      { promiseDate: "2026-08-02", note: "disputed" },
      { storage, now: NOW }
    );
    applyCollectionResolution(
      INVOICE_D,
      { kind: "disputed", reason: "amount mismatch" },
      { storage, now: NOW }
    );
    savePromiseToPay(
      INVOICE_E,
      { promiseDate: "2026-07-27", note: "follow-up" },
      { storage, now: NOW }
    );
    updatePromiseStatus(INVOICE_E, "follow_up_required", { storage, now: NOW });

    const invoices = [
      invoice(INVOICE_A, { documentNumber: "INV-A", totalAmount: 100 }),
      invoice(INVOICE_B, { documentNumber: "INV-B", totalAmount: 200 }),
      invoice(INVOICE_C, { documentNumber: "INV-C", totalAmount: 300 }),
      invoice(INVOICE_D, { documentNumber: "INV-D", totalAmount: 400 }),
      invoice(INVOICE_E, { documentNumber: "INV-E", totalAmount: 500 })
    ];
    const records = listPromiseRecordsFromStorage(storage);
    const cases = buildWorkbenchCases(invoices, records, NOW);
    const sections = buildWorkbenchSectionSummaries(cases, { hideCompleted: true });
    const byId = Object.fromEntries(sections.map((s) => [s.id, s]));

    assert.equal(byId.due_today?.count, 1);
    assert.equal(byId.broken?.count, 1);
    assert.equal(byId.escalated?.count, 1);
    assert.equal(byId.disputed?.count, 1);
    assert.equal(byId.follow_up_required?.count, 1);
    assert.equal(byId.due_today?.totalsByCurrency[0]?.amount, 100);
    assert.equal(byId.broken?.totalsByCurrency[0]?.currency, "UAH");

    const kpi = buildWorkbenchKpi(cases, NOW);
    assert.equal(kpi.activeCollectionCases, 5);
    assert.equal(kpi.dueTodayCount, 1);
    assert.equal(kpi.brokenCount, 1);
    assert.equal(kpi.escalatedCount, 1);
    assert.equal(kpi.disputedCount, 1);
    assert.equal(kpi.completedTodayCount, 0);

    updatePromiseStatus(INVOICE_A, "completed", { storage, now: NOW });
    const after = buildWorkbenchCases(
      invoices,
      listPromiseRecordsFromStorage(storage),
      NOW
    );
    assert.equal(buildWorkbenchKpi(after, NOW).completedTodayCount, 1);
  });
});

describe("collectionWorkbench filters sort hide completed", () => {
  it("searches, sorts, filters section, and hides completed", () => {
    const cases: WorkbenchCase[] = [
      toWorkbenchCase(
        baseItem({
          invoiceId: INVOICE_A,
          documentNumber: "INV-100",
          counterpartyReference: "zeta",
          overdueAmount: 50,
          promiseDate: "2026-07-30",
          group: "upcoming",
          daysRelativeToPromise: 2
        })
      ),
      toWorkbenchCase(
        baseItem({
          invoiceId: INVOICE_B,
          documentNumber: "INV-200",
          counterpartyReference: "acme",
          overdueAmount: 500,
          promiseDate: "2026-07-20",
          group: "broken",
          daysRelativeToPromise: -8
        })
      ),
      toWorkbenchCase(
        baseItem({
          invoiceId: INVOICE_C,
          documentNumber: "INV-300",
          counterpartyReference: "beta",
          overdueAmount: 200,
          promiseDate: "2026-07-28",
          group: "completed",
          status: "completed",
          completedAtUtc: NOW.toISOString()
        })
      )
    ];

    const searched = filterWorkbenchCases(cases, { search: "acme" });
    assert.equal(searched.length, 1);
    assert.equal(searched[0]?.invoiceId, INVOICE_B);

    const section = filterWorkbenchCases(cases, { section: "broken" });
    assert.equal(section.length, 1);
    assert.equal(section[0]?.group, "broken");

    const hidden = filterWorkbenchCases(cases, { hideCompleted: true });
    assert.equal(hidden.every((item) => item.group !== "completed"), true);
    assert.equal(hidden.length, 2);

    const byAmount = filterWorkbenchCases(cases, {
      hideCompleted: true,
      sort: "amount_desc"
    });
    assert.deepEqual(
      byAmount.map((item) => item.invoiceId),
      [INVOICE_B, INVOICE_A]
    );

    const byCustomer = filterWorkbenchCases(cases, {
      hideCompleted: true,
      sort: "customer_asc"
    });
    assert.deepEqual(
      byCustomer.map((item) => item.counterpartyReference),
      ["acme", "zeta"]
    );
  });

  it("parses workbench URL helpers and ignores unknown values", () => {
    assert.equal(parseWorkbenchSectionParam("broken"), "broken");
    assert.equal(parseWorkbenchSectionParam("paid"), "");
    assert.equal(parseWorkbenchSortParam("amount_desc"), "amount_desc");
    assert.equal(parseWorkbenchSortParam("nope"), "priority");
    assert.equal(parseWorkbenchHideCompletedParam("1"), true);
    assert.equal(parseWorkbenchHideCompletedParam("false"), false);
  });
});

describe("collectionWorkbench mass actions and persistence", () => {
  it("applies mass contacted / follow-up / complete and restores after reload", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(INVOICE_A, { promiseDate: "2026-07-20" }, { storage, now: NOW });
    savePromiseToPay(INVOICE_B, { promiseDate: "2026-07-21" }, { storage, now: NOW });
    savePromiseToPay(INVOICE_C, { promiseDate: "2026-07-22" }, { storage, now: NOW });

    const contacted = applyWorkbenchMassAction(
      [INVOICE_A, INVOICE_B],
      "mark_contacted",
      { storage, now: NOW }
    );
    assert.deepEqual(contacted.okIds, [INVOICE_A, INVOICE_B]);
    assert.equal(contacted.skippedIds.length, 0);

    const followUp = applyWorkbenchMassAction(
      [INVOICE_A],
      "mark_follow_up_required",
      { storage, now: NOW }
    );
    assert.deepEqual(followUp.okIds, [INVOICE_A]);

    const completed = applyWorkbenchMassAction([INVOICE_C], "complete", {
      storage,
      now: NOW
    });
    assert.deepEqual(completed.okIds, [INVOICE_C]);

    const missing = applyWorkbenchMassAction(
      ["ffffffff-ffff-ffff-ffff-ffffffffffff"],
      "mark_contacted",
      { storage, now: NOW }
    );
    assert.equal(missing.okIds.length, 0);
    assert.equal(missing.skippedIds.length, 1);

    // Simulate reload: re-read from storage.
    const reloaded = listPromiseRecordsFromStorage(storage);
    const byId = Object.fromEntries(reloaded.map((r) => [r.invoiceId, r]));
    assert.equal(byId[INVOICE_A]?.status, "follow_up_required");
    assert.equal(byId[INVOICE_B]?.status, "contacted");
    assert.equal(byId[INVOICE_C]?.status, "completed");
  });

  it("ignores corrupted localStorage entries safely", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(INVOICE_A, { promiseDate: "2026-07-20" }, { storage, now: NOW });
    storage.setItem(storageKeyForInvoice(INVOICE_B), "{not-json");
    storage.setItem(storageKeyForInvoice(INVOICE_C), JSON.stringify({ invoiceId: "bad" }));

    const records = listPromiseRecordsFromStorage(storage);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.invoiceId, INVOICE_A);

    const cases = buildWorkbenchCases(
      [invoice(INVOICE_A), invoice(INVOICE_B), invoice(INVOICE_C)],
      records,
      NOW
    );
    assert.equal(cases.length, 1);

    removePromiseFromStorage(INVOICE_A, storage);
    assert.equal(listPromiseRecordsFromStorage(storage).length, 0);
  });
});
