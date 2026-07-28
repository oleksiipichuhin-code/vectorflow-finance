import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
        completedAtUtc: null
      },
      {
        invoiceId: INVOICE_B,
        promiseDate: "2026-07-20",
        note: "",
        status: "awaiting",
        updatedAtUtc: "2026-07-28T00:00:00.000Z",
        completedAtUtc: null
      },
      {
        invoiceId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        promiseDate: "2026-08-05",
        note: "",
        status: "follow_up_required",
        updatedAtUtc: "2026-07-28T00:00:00.000Z",
        completedAtUtc: null
      },
      {
        invoiceId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        promiseDate: "2026-07-15",
        note: "done",
        status: "completed",
        updatedAtUtc: "2026-07-27T00:00:00.000Z",
        completedAtUtc: "2026-07-27T00:00:00.000Z"
      }
    ];

    const items = buildPromiseFollowUpItems(invoices, records, now);
    const summary = buildPromiseFollowUpSummary(items);

    assert.equal(summary.dueTodayCount, 1);
    assert.equal(summary.brokenCount, 1);
    assert.equal(summary.followUpRequiredCount, 1);
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
          completedAtUtc: null
        },
        {
          invoiceId: INVOICE_B,
          promiseDate: "2026-08-02",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null
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
          completedAtUtc: null
        },
        {
          invoiceId: INVOICE_B,
          promiseDate: "2026-08-02",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null
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
          completedAtUtc: null
        },
        {
          invoiceId: INVOICE_B,
          promiseDate: "2026-07-01",
          note: "",
          status: "awaiting",
          updatedAtUtc: "2026-07-28T00:00:00.000Z",
          completedAtUtc: null
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
