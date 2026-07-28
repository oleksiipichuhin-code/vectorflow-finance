import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCollectionResolution,
  buildPromiseFollowUpItems,
  buildPromiseFollowUpSummary,
  classifyPromiseGroup,
  filterPromiseFollowUps,
  groupPromiseFollowUps,
  listPromiseRecordsFromStorage,
  readPromiseFromStorage,
  removePromiseFromStorage,
  savePromiseToPay,
  sanitizePromiseRecord,
  storageKeyForInvoice,
  updatePromiseStatus,
  validateCollectionResolutionInput,
  validatePromiseToPayInput,
  type PromiseInvoiceLike,
  type PromiseToPayRecord
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

describe("promiseToPay validation", () => {
  it("rejects empty promise date", () => {
    const result = validatePromiseToPayInput({ promiseDate: "", note: "x" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /обіцяну дату/i);
    }
  });

  it("rejects invalid promise date", () => {
    const result = validatePromiseToPayInput({ promiseDate: "07-28-2026" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Некоректна дата/i);
    }
  });

  it("accepts valid date and trims note", () => {
    const result = validatePromiseToPayInput({
      promiseDate: " 2026-08-01 ",
      note: "  call back  "
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.promiseDate, "2026-08-01");
      assert.equal(result.note, "call back");
    }
  });
});

describe("promiseToPay create and update", () => {
  it("creates a promise-to-pay record", () => {
    const storage = new MemoryStorage();
    const now = new Date("2026-07-28T10:00:00.000Z");
    const result = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "Will pay Friday" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.invoiceId, INVOICE_A);
    assert.equal(result.record.promiseDate, "2026-08-05");
    assert.equal(result.record.note, "Will pay Friday");
    assert.equal(result.record.status, "awaiting");
    assert.equal(readPromiseFromStorage(INVOICE_A, storage)?.promiseDate, "2026-08-05");
  });

  it("updates existing promise without creating duplicates", () => {
    const storage = new MemoryStorage();
    const first = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "first" },
      { storage, now: new Date("2026-07-28T10:00:00.000Z") }
    );
    assert.equal(first.ok, true);

    const second = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-10", note: "updated" },
      { storage, now: new Date("2026-07-28T11:00:00.000Z"), preserveStatus: true }
    );
    assert.equal(second.ok, true);
    if (!second.ok) {
      return;
    }
    assert.equal(second.record.promiseDate, "2026-08-10");
    assert.equal(second.record.note, "updated");

    const keys = [...Array(storage.length)].map((_, i) => storage.key(i));
    const promiseKeys = keys.filter((key) => key?.startsWith("vectorflow.finance.promiseToPay."));
    assert.equal(promiseKeys.length, 1);
    assert.equal(listPromiseRecordsFromStorage(storage).length, 1);
  });

  it("save without date returns validation error and writes nothing", () => {
    const storage = new MemoryStorage();
    const result = savePromiseToPay(INVOICE_A, { promiseDate: "" }, { storage });
    assert.equal(result.ok, false);
    assert.equal(storage.length, 0);
  });
});

describe("promiseToPay classification", () => {
  const now = new Date(2026, 6, 28, 15, 0, 0); // local Jul 28 2026

  function record(
    overrides: Partial<PromiseToPayRecord> = {}
  ): PromiseToPayRecord {
    return {
      invoiceId: INVOICE_A,
      promiseDate: "2026-07-30",
      note: "",
      status: "awaiting",
      updatedAtUtc: "2026-07-28T10:00:00.000Z",
      completedAtUtc: null,
      resolution: null,
      ...overrides
    };
  }

  it("classifies Due today", () => {
    assert.equal(classifyPromiseGroup(record({ promiseDate: "2026-07-28" }), now), "due_today");
  });

  it("classifies Upcoming", () => {
    assert.equal(classifyPromiseGroup(record({ promiseDate: "2026-08-01" }), now), "upcoming");
  });

  it("classifies Broken promise", () => {
    assert.equal(classifyPromiseGroup(record({ promiseDate: "2026-07-20" }), now), "broken");
  });

  it("classifies Follow-up required", () => {
    assert.equal(
      classifyPromiseGroup(
        record({ promiseDate: "2026-08-01", status: "follow_up_required" }),
        now
      ),
      "follow_up_required"
    );
  });

  it("classifies Completed recently", () => {
    assert.equal(
      classifyPromiseGroup(
        record({
          status: "completed",
          completedAtUtc: "2026-07-25T12:00:00.000Z",
          promiseDate: "2026-07-20"
        }),
        now
      ),
      "completed"
    );
  });

  it("hides completed older than recent window", () => {
    assert.equal(
      classifyPromiseGroup(
        record({
          status: "completed",
          completedAtUtc: "2026-06-01T12:00:00.000Z",
          promiseDate: "2026-06-01"
        }),
        now
      ),
      null
    );
  });
});

describe("promiseToPay KPI and search", () => {
  const now = new Date(2026, 6, 28, 12, 0, 0);

  it("calculates KPI counts and promised amounts by currency", () => {
    const invoices = [
      invoice(INVOICE_A, {
        documentNumber: "INV-A",
        counterpartyReference: "acme",
        totalAmount: 100,
        currency: "UAH"
      }),
      invoice(INVOICE_B, {
        documentNumber: "INV-B",
        counterpartyReference: "beta",
        totalAmount: 50,
        currency: "EUR"
      }),
      invoice("cccccccc-cccc-cccc-cccc-cccccccccccc", {
        documentNumber: "INV-C",
        counterpartyReference: "gamma",
        totalAmount: 200,
        currency: "UAH"
      }),
      invoice("dddddddd-dddd-dddd-dddd-dddddddddddd", {
        documentNumber: "INV-D",
        counterpartyReference: "delta",
        totalAmount: 75,
        currency: "UAH"
      })
    ];

    const records: PromiseToPayRecord[] = [
      {
        invoiceId: INVOICE_A,
        promiseDate: "2026-07-28",
        note: "",
        status: "awaiting",
        updatedAtUtc: "2026-07-28T00:00:00.000Z",
        completedAtUtc: null,
      resolution: null
      },
      {
        invoiceId: INVOICE_B,
        promiseDate: "2026-07-20",
        note: "",
        status: "awaiting",
        updatedAtUtc: "2026-07-28T00:00:00.000Z",
        completedAtUtc: null,
      resolution: null
      },
      {
        invoiceId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        promiseDate: "2026-08-05",
        note: "",
        status: "follow_up_required",
        updatedAtUtc: "2026-07-28T00:00:00.000Z",
        completedAtUtc: null,
      resolution: null
      },
      {
        invoiceId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        promiseDate: "2026-07-15",
        note: "done",
        status: "completed",
        updatedAtUtc: "2026-07-27T00:00:00.000Z",
        completedAtUtc: "2026-07-27T00:00:00.000Z",
      resolution: null
      }
    ];

    const items = buildPromiseFollowUpItems(invoices, records, now);
    const summary = buildPromiseFollowUpSummary(items, now);

    assert.equal(summary.dueTodayCount, 1);
    assert.equal(summary.brokenCount, 1);
    assert.equal(summary.followUpRequiredCount, 1);
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.escalatedCount, 0);
    assert.equal(summary.disputedCount, 0);
    assert.deepEqual(summary.promisedTotalsByCurrency, [
      { currency: "EUR", amount: 50 },
      { currency: "UAH", amount: 300 }
    ]);
  });

  it("searches by invoice number", () => {
    const items = buildPromiseFollowUpItems(
      [
        invoice(INVOICE_A, { documentNumber: "INV-100", counterpartyReference: "acme" }),
        invoice(INVOICE_B, { documentNumber: "INV-200", counterpartyReference: "beta" })
      ],
      [
        {
          invoiceId: INVOICE_A,
          promiseDate: "2026-08-01",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null,
        resolution: null
        },
        {
          invoiceId: INVOICE_B,
          promiseDate: "2026-08-02",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null,
        resolution: null
        }
      ],
      now
    );

    const filtered = filterPromiseFollowUps(items, { search: "INV-100" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.documentNumber, "INV-100");
  });

  it("searches by counterparty", () => {
    const items = buildPromiseFollowUpItems(
      [
        invoice(INVOICE_A, { documentNumber: "INV-100", counterpartyReference: "acme-ua" }),
        invoice(INVOICE_B, { documentNumber: "INV-200", counterpartyReference: "beta-pl" })
      ],
      [
        {
          invoiceId: INVOICE_A,
          promiseDate: "2026-08-01",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null,
        resolution: null
        },
        {
          invoiceId: INVOICE_B,
          promiseDate: "2026-08-02",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null,
        resolution: null
        }
      ],
      now
    );

    const filtered = filterPromiseFollowUps(items, { search: "beta" });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.counterpartyReference, "beta-pl");
  });

  it("groups items by classification", () => {
    const items = buildPromiseFollowUpItems(
      [invoice(INVOICE_A), invoice(INVOICE_B)],
      [
        {
          invoiceId: INVOICE_A,
          promiseDate: "2026-07-28",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null,
        resolution: null
        },
        {
          invoiceId: INVOICE_B,
          promiseDate: "2026-07-01",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null,
        resolution: null
        }
      ],
      now
    );
    const groups = groupPromiseFollowUps(items);
    assert.equal(groups.due_today.length, 1);
    assert.equal(groups.broken.length, 1);
  });
});

describe("promiseToPay status actions and persistence safety", () => {
  it("marks follow-up required, contacted, completed, and reopen", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "n" },
      { storage, now: new Date("2026-07-28T10:00:00.000Z") }
    );

    assert.equal(
      updatePromiseStatus(INVOICE_A, "follow_up_required", { storage }).ok,
      true
    );
    assert.equal(readPromiseFromStorage(INVOICE_A, storage)?.status, "follow_up_required");

    assert.equal(updatePromiseStatus(INVOICE_A, "contacted", { storage }).ok, true);
    assert.equal(readPromiseFromStorage(INVOICE_A, storage)?.status, "contacted");

    const completed = updatePromiseStatus(INVOICE_A, "completed", {
      storage,
      now: new Date("2026-07-28T12:00:00.000Z")
    });
    assert.equal(completed.ok, true);
    if (completed.ok) {
      assert.equal(completed.record.status, "completed");
      assert.ok(completed.record.completedAtUtc);
    }

    const reopened = updatePromiseStatus(INVOICE_A, "awaiting", { storage });
    assert.equal(reopened.ok, true);
    if (reopened.ok) {
      assert.equal(reopened.record.status, "awaiting");
      assert.equal(reopened.record.completedAtUtc, null);
    }
  });

  it("safely handles corrupted browser persistence", () => {
    const storage = new MemoryStorage();
    storage.setItem(storageKeyForInvoice(INVOICE_A), "{not-json");
    assert.equal(readPromiseFromStorage(INVOICE_A, storage), null);

    storage.setItem(
      storageKeyForInvoice(INVOICE_A),
      JSON.stringify({ invoiceId: INVOICE_A, promiseDate: "bad", status: "awaiting" })
    );
    assert.equal(readPromiseFromStorage(INVOICE_A, storage), null);

    storage.setItem(
      storageKeyForInvoice(INVOICE_A),
      JSON.stringify({ invoiceId: "not-a-guid", promiseDate: "2026-08-01", status: "awaiting" })
    );
    assert.equal(sanitizePromiseRecord(JSON.parse(storage.getItem(storageKeyForInvoice(INVOICE_A))!)), null);
    assert.equal(readPromiseFromStorage(INVOICE_A, storage), null);

    assert.equal(sanitizePromiseRecord(null), null);
    assert.equal(sanitizePromiseRecord(42), null);
    assert.equal(sanitizePromiseRecord({}), null);
  });

  it("removePromiseFromStorage clears the key", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(INVOICE_A, { promiseDate: "2026-08-01" }, { storage });
    removePromiseFromStorage(INVOICE_A, storage);
    assert.equal(readPromiseFromStorage(INVOICE_A, storage), null);
  });
});

describe("collection resolution workflow", () => {
  const now = new Date(2026, 6, 28, 15, 0, 0);

  function seed(storage: MemoryStorage, promiseDate = "2026-08-05") {
    const saved = savePromiseToPay(
      INVOICE_A,
      { promiseDate, note: "base" },
      { storage, now: new Date("2026-07-28T10:00:00.000Z") }
    );
    assert.equal(saved.ok, true);
    return saved;
  }

  it("resolves Paid → completed group", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const result = applyCollectionResolution(
      INVOICE_A,
      { kind: "paid", paymentDate: "2026-07-28", note: "wire received" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.status, "completed");
    assert.equal(result.record.resolution?.kind, "paid");
    assert.equal(classifyPromiseGroup(result.record, now), "completed");
  });

  it("resolves Partial Payment and keeps follow-up amount", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const result = applyCollectionResolution(
      INVOICE_A,
      {
        kind: "partially_paid",
        paymentDate: "2026-07-28",
        paidAmount: "400",
        remainingAmount: "600",
        note: "partial"
      },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.resolution?.kind, "partially_paid");
    assert.equal(result.record.resolution?.paidAmount, 400);
    assert.equal(result.record.resolution?.remainingAmount, 600);
    assert.equal(classifyPromiseGroup(result.record, now), "upcoming");

    const item = buildPromiseFollowUpItems(
      [invoice(INVOICE_A, { totalAmount: 1000 })],
      [result.record],
      now
    )[0];
    assert.equal(item?.overdueAmount, 600);
    assert.equal(item?.group, "upcoming");
  });

  it("resolves New Promise → Upcoming", () => {
    const storage = new MemoryStorage();
    seed(storage, "2026-07-20");
    const result = applyCollectionResolution(
      INVOICE_A,
      { kind: "new_promise", promiseDate: "2026-08-10", note: "rescheduled" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.promiseDate, "2026-08-10");
    assert.equal(result.record.resolution?.kind, "new_promise");
    assert.equal(classifyPromiseGroup(result.record, now), "upcoming");
  });

  it("resolves Disputed → disputed group", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const result = applyCollectionResolution(
      INVOICE_A,
      { kind: "disputed", reason: "Wrong amount", note: "legal" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.resolution?.kind, "disputed");
    assert.equal(classifyPromiseGroup(result.record, now), "disputed");
  });

  it("resolves Escalated → escalated group", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const result = applyCollectionResolution(
      INVOICE_A,
      { kind: "escalated", reason: "Manager review", note: "" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.resolution?.kind, "escalated");
    assert.equal(classifyPromiseGroup(result.record, now), "escalated");
  });

  it("resolves Unable to Contact → follow-up required", () => {
    const storage = new MemoryStorage();
    seed(storage);
    const result = applyCollectionResolution(
      INVOICE_A,
      { kind: "unable_to_contact", note: "no answer" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.record.status, "follow_up_required");
    assert.equal(result.record.resolution?.kind, "unable_to_contact");
    assert.equal(classifyPromiseGroup(result.record, now), "follow_up_required");
  });

  it("validates required fields per resolution kind", () => {
    const existing: PromiseToPayRecord = {
      invoiceId: INVOICE_A,
      promiseDate: "2026-08-01",
      note: "",
      status: "awaiting",
      updatedAtUtc: "2026-07-28T00:00:00.000Z",
      completedAtUtc: null,
      resolution: null
    };
    assert.equal(
      validateCollectionResolutionInput({ kind: "paid", paymentDate: "" }, existing, now).ok,
      false
    );
    assert.equal(
      validateCollectionResolutionInput(
        { kind: "partially_paid", paymentDate: "2026-07-28", paidAmount: "0", remainingAmount: "1" },
        existing,
        now
      ).ok,
      false
    );
    assert.equal(
      validateCollectionResolutionInput({ kind: "new_promise", promiseDate: "" }, existing, now)
        .ok,
      false
    );
    assert.equal(
      validateCollectionResolutionInput({ kind: "disputed", reason: "" }, existing, now).ok,
      false
    );
    assert.equal(
      validateCollectionResolutionInput({ kind: "escalated", reason: "   " }, existing, now).ok,
      false
    );
  });

  it("calculates resolution KPI including resolved today / escalated / disputed", () => {
    const invoices = [
      invoice(INVOICE_A, { totalAmount: 100, currency: "UAH" }),
      invoice(INVOICE_B, { totalAmount: 50, currency: "UAH" }),
      invoice("cccccccc-cccc-cccc-cccc-cccccccccccc", {
        totalAmount: 75,
        currency: "UAH"
      })
    ];
    const records: PromiseToPayRecord[] = [
      {
        invoiceId: INVOICE_A,
        promiseDate: "2026-07-20",
        note: "",
        status: "completed",
        updatedAtUtc: "2026-07-28T12:00:00.000Z",
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
      },
      {
        invoiceId: INVOICE_B,
        promiseDate: "2026-08-01",
        note: "",
        status: "follow_up_required",
        updatedAtUtc: "2026-07-28T12:00:00.000Z",
        completedAtUtc: null,
        resolution: {
          kind: "escalated",
          resolvedAtUtc: "2026-07-28T12:00:00.000Z",
          paymentDate: null,
          paidAmount: null,
          remainingAmount: null,
          reason: "manager",
          note: ""
        }
      },
      {
        invoiceId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        promiseDate: "2026-08-01",
        note: "",
        status: "follow_up_required",
        updatedAtUtc: "2026-07-28T12:00:00.000Z",
        completedAtUtc: null,
        resolution: {
          kind: "disputed",
          resolvedAtUtc: "2026-07-28T12:00:00.000Z",
          paymentDate: null,
          paidAmount: null,
          remainingAmount: null,
          reason: "amount",
          note: ""
        }
      }
    ];
    const items = buildPromiseFollowUpItems(invoices, records, now);
    const summary = buildPromiseFollowUpSummary(items, now);
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.escalatedCount, 1);
    assert.equal(summary.disputedCount, 1);
    assert.equal(summary.resolvedTodayCount, 3);
    const groups = groupPromiseFollowUps(items);
    assert.equal(groups.completed.length, 1);
    assert.equal(groups.escalated.length, 1);
    assert.equal(groups.disputed.length, 1);
  });

  it("prevents duplicate records when re-applying resolution", () => {
    const storage = new MemoryStorage();
    seed(storage);
    applyCollectionResolution(
      INVOICE_A,
      { kind: "paid", paymentDate: "2026-07-28" },
      { storage, now }
    );
    applyCollectionResolution(
      INVOICE_A,
      { kind: "paid", paymentDate: "2026-07-29", note: "corrected" },
      { storage, now }
    );
    assert.equal(listPromiseRecordsFromStorage(storage).length, 1);
    assert.equal(readPromiseFromStorage(INVOICE_A, storage)?.resolution?.paymentDate, "2026-07-29");
  });

  it("ignores corrupted resolution payload without dropping valid promise core", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      storageKeyForInvoice(INVOICE_A),
      JSON.stringify({
        invoiceId: INVOICE_A,
        promiseDate: "2026-08-01",
        status: "awaiting",
        note: "",
        updatedAtUtc: "2026-07-28T00:00:00.000Z",
        completedAtUtc: null,
        resolution: { kind: "not-a-kind" }
      })
    );
    const record = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(record);
    assert.equal(record?.resolution, null);
    assert.equal(record?.promiseDate, "2026-08-01");
  });

  it("resolution transitions Broken → New Promise → Upcoming", () => {
    const storage = new MemoryStorage();
    seed(storage, "2026-07-10");
    const before = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(classifyPromiseGroup(before!, now), "broken");
    const after = applyCollectionResolution(
      INVOICE_A,
      { kind: "new_promise", promiseDate: "2026-08-15" },
      { storage, now }
    );
    assert.equal(after.ok, true);
    if (after.ok) {
      assert.equal(classifyPromiseGroup(after.record, now), "upcoming");
    }
  });
});
