import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCollectionResolution,
  buildPromiseFollowUpItems,
  buildPromiseFollowUpSummary,
  classifyPromiseGroup,
  completeCollectionEscalation,
  filterPromiseFollowUps,
  groupPromiseFollowUps,
  isEscalationOverdue,
  listActiveNextActionCandidates,
  listPromiseRecordsFromStorage,
  NEXT_ACTION_TIE_BREAK,
  raiseCollectionDispute,
  raiseCollectionEscalation,
  readPromiseFromStorage,
  rejectCollectionDispute,
  removePromiseFromStorage,
  resolveCollectionDispute,
  resolveNextAction,
  resolveNextActionDate,
  saveCollectionContact,
  savePromiseToPay,
  sanitizePromiseRecord,
  storageKeyForInvoice,
  updateCollectionDispute,
  updateCollectionEscalation,
  updateContactFollowUp,
  updatePromiseStatus,
  validateCollectionContactInput,
  validateCollectionDisputeInput,
  validateCollectionEscalationInput,
  validateCollectionResolutionInput,
  validateDisputeCloseInput,
  validateEscalationCompleteInput,
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
      nextFollowUpAt: null,
      lastContact: null,
      dispute: null,
      escalation: null,
      paymentPlan: null,
      notes: [],
      reminders: [],
      history: [],
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
      resolution: null,
      nextFollowUpAt: null,
      lastContact: null,
      dispute: null,
      escalation: null,
      paymentPlan: null,
      notes: [],
      reminders: [],
      history: []
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

describe("collection contact follow-up", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("rejects empty contact action", () => {
    const result = validateCollectionContactInput({
      channel: "",
      result: "",
      note: "",
      followUpAt: ""
    });
    assert.equal(result.ok, false);
  });

  it("requires channel and result", () => {
    assert.equal(
      validateCollectionContactInput({ channel: "", result: "reached" }).ok,
      false
    );
    assert.equal(
      validateCollectionContactInput({ channel: "phone", result: "" }).ok,
      false
    );
  });

  it("saves contact attempt with follow-up and restores after reload", () => {
    const storage = new MemoryStorage();
    const saved = saveCollectionContact(
      INVOICE_A,
      {
        channel: "phone",
        result: "no_answer",
        note: "tried morning",
        followUpAt: "2026-08-05"
      },
      { storage, now }
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.record.nextFollowUpAt, "2026-08-05");
    assert.equal(saved.record.status, "follow_up_required");
    assert.equal(saved.record.lastContact?.channel, "phone");
    assert.equal(saved.record.lastContact?.result, "no_answer");
    assert.equal(classifyPromiseGroup(saved.record, now), "follow_up_required");

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(reloaded);
    assert.equal(reloaded?.nextFollowUpAt, "2026-08-05");
    assert.equal(reloaded?.lastContact?.note, "tried morning");
    assert.ok(reloaded?.history.some((event) => event.type === "contact_logged"));

    const items = buildPromiseFollowUpItems(
      [invoice(INVOICE_A)],
      [reloaded!],
      now
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.group, "follow_up_required");
    assert.equal(items[0]?.nextActionDate, "2026-08-05");
    assert.equal(items[0]?.nextFollowUpAt, "2026-08-05");

    const filtered = filterPromiseFollowUps(items, { group: "follow_up_required" });
    assert.equal(filtered.length, 1);
  });

  it("clears and changes follow-up predictably", () => {
    const storage = new MemoryStorage();
    saveCollectionContact(
      INVOICE_A,
      { channel: "email", result: "left_message", followUpAt: "2026-08-01" },
      { storage, now }
    );
    const changed = updateContactFollowUp(INVOICE_A, "2026-08-10", { storage, now });
    assert.equal(changed.ok, true);
    if (!changed.ok) return;
    assert.equal(changed.record.nextFollowUpAt, "2026-08-10");
    assert.equal(changed.record.status, "follow_up_required");

    const cleared = updateContactFollowUp(INVOICE_A, null, { storage, now });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal(cleared.record.nextFollowUpAt, null);
    assert.equal(cleared.record.status, "contacted");
    assert.notEqual(classifyPromiseGroup(cleared.record, now), "follow_up_required");
  });

  it("does not duplicate contact on identical fingerprint and preserves promise history", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "will pay" },
      { storage, now }
    );
    const first = saveCollectionContact(
      INVOICE_A,
      { channel: "message", result: "reached", note: "ok" },
      { storage, now }
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = saveCollectionContact(
      INVOICE_A,
      { channel: "message", result: "reached", note: "ok" },
      { storage, now }
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const contactEvents = second.record.history.filter((e) => e.type === "contact_logged");
    assert.equal(contactEvents.length, 1);
    assert.ok(second.record.history.some((e) => e.type === "promise_created"));
  });

  it("flags payment_promised for Promise to pay without inventing resolution", () => {
    const storage = new MemoryStorage();
    const result = saveCollectionContact(
      INVOICE_A,
      { channel: "phone", result: "payment_promised", note: "friday" },
      { storage, now }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.needsPromise, true);
    assert.equal(result.record.resolution, null);
    assert.equal(result.record.status, "contacted");
  });
});

describe("collection dispute workflow", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("parses old records without dispute field", () => {
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
        resolution: null,
        history: []
      })
    );
    const record = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(record);
    assert.equal(record?.dispute, null);
  });

  it("validates required dispute fields", () => {
    assert.equal(
      validateCollectionDisputeInput({
        reason: "",
        description: "",
        responsibleParty: ""
      }).ok,
      false
    );
    assert.equal(
      validateCollectionDisputeInput({
        reason: "",
        description: "x",
        responsibleParty: "finance"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionDisputeInput({
        reason: "incorrect_amount",
        description: "",
        responsibleParty: "finance"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionDisputeInput({
        reason: "incorrect_amount",
        description: "wrong total",
        responsibleParty: ""
      }).ok,
      false
    );
    assert.equal(validateDisputeCloseInput({ comment: "" }).ok, false);
  });

  it("raises dispute with review date and maps workbench eligibility", () => {
    const storage = new MemoryStorage();
    const raised = raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "incorrect_amount",
        description: "amount off by 100",
        responsibleParty: "finance",
        nextReviewAt: "2026-08-15"
      },
      { storage, now }
    );
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    assert.equal(raised.record.dispute?.status, "open");
    assert.equal(raised.record.dispute?.nextReviewAt, "2026-08-15");
    assert.equal(classifyPromiseGroup(raised.record, now), "disputed");
    assert.ok(raised.record.history.some((e) => e.type === "dispute_raised"));

    const items = buildPromiseFollowUpItems(
      [invoice(INVOICE_A)],
      [raised.record],
      now
    );
    assert.equal(items[0]?.group, "disputed");
    assert.equal(items[0]?.disputeReviewAt, "2026-08-15");
    assert.equal(items[0]?.nextActionDate, "2026-08-15");
    assert.equal(filterPromiseFollowUps(items, { group: "disputed" }).length, 1);
  });

  it("blocks second active dispute and updates without duplicating dispute entity", () => {
    const storage = new MemoryStorage();
    raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "duplicate_invoice",
        description: "dup",
        responsibleParty: "collections",
        nextReviewAt: "2026-08-01"
      },
      { storage, now }
    );
    const second = raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "other",
        description: "another",
        responsibleParty: "customer"
      },
      { storage, now: new Date(now.getTime() + 1000) }
    );
    assert.equal(second.ok, false);

    const updated = updateCollectionDispute(
      INVOICE_A,
      {
        reason: "missing_documents",
        description: "need PO",
        responsibleParty: "operations",
        nextReviewAt: "2026-08-20"
      },
      { storage, now: new Date(now.getTime() + 2000) }
    );
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.record.dispute?.reason, "missing_documents");
    assert.equal(updated.record.dispute?.nextReviewAt, "2026-08-20");
    assert.equal(
      updated.record.history.filter((e) => e.type === "dispute_raised").length,
      1
    );
    assert.equal(
      updated.record.history.filter((e) => e.type === "dispute_updated").length,
      1
    );

    const noop = updateCollectionDispute(
      INVOICE_A,
      {
        reason: "missing_documents",
        description: "need PO",
        responsibleParty: "operations",
        nextReviewAt: "2026-08-20"
      },
      { storage, now: new Date(now.getTime() + 3000) }
    );
    assert.equal(noop.ok, true);
    if (!noop.ok) return;
    assert.equal(
      noop.record.history.filter((e) => e.type === "dispute_updated").length,
      1
    );
  });

  it("coexists with contact follow-up dates and resolves with required comment", () => {
    const storage = new MemoryStorage();
    saveCollectionContact(
      INVOICE_A,
      {
        channel: "phone",
        result: "no_answer",
        note: "busy",
        followUpAt: "2026-08-05"
      },
      { storage, now }
    );
    const raised = raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "service_not_received",
        description: "not delivered",
        responsibleParty: "customer",
        nextReviewAt: "2026-08-10"
      },
      { storage, now: new Date(now.getTime() + 1000) }
    );
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    assert.equal(raised.record.nextFollowUpAt, "2026-08-05");
    assert.equal(raised.record.dispute?.nextReviewAt, "2026-08-10");
    assert.equal(classifyPromiseGroup(raised.record, now), "disputed");
    const item = buildPromiseFollowUpItems(
      [invoice(INVOICE_A)],
      [raised.record],
      now
    )[0];
    assert.equal(item?.nextActionDate, "2026-08-05");
    assert.equal(item?.nextFollowUpAt, "2026-08-05");
    assert.equal(item?.disputeReviewAt, "2026-08-10");

    assert.equal(
      resolveCollectionDispute(INVOICE_A, { comment: "" }, { storage, now }).ok,
      false
    );
    const resolved = resolveCollectionDispute(
      INVOICE_A,
      { comment: "docs received, cleared" },
      { storage, now: new Date(now.getTime() + 2000) }
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.record.dispute?.status, "resolved");
    assert.equal(resolved.record.dispute?.nextReviewAt, null);
    assert.ok(resolved.record.history.some((e) => e.type === "dispute_resolved"));
    assert.ok(resolved.record.history.some((e) => e.type === "contact_logged"));
    assert.notEqual(classifyPromiseGroup(resolved.record, now), "disputed");
    assert.equal(
      filterPromiseFollowUps(
        buildPromiseFollowUpItems([invoice(INVOICE_A)], [resolved.record], now),
        { group: "disputed" }
      ).length,
      0
    );
  });

  it("rejects dispute with required comment and preserves prior history", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "base" },
      { storage, now }
    );
    raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "contract_mismatch",
        description: "terms differ",
        responsibleParty: "finance"
      },
      { storage, now: new Date(now.getTime() + 1000) }
    );
    const rejected = rejectCollectionDispute(
      INVOICE_A,
      { comment: "customer withdrew dispute" },
      { storage, now: new Date(now.getTime() + 2000) }
    );
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    assert.equal(rejected.record.dispute?.status, "rejected");
    assert.ok(rejected.record.history.some((e) => e.type === "promise_created"));
    assert.ok(rejected.record.history.some((e) => e.type === "dispute_raised"));
    assert.ok(rejected.record.history.some((e) => e.type === "dispute_rejected"));
  });
});

describe("collection escalation workflow", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");
  const invoice: PromiseInvoiceLike = {
    id: INVOICE_A,
    documentNumber: "INV-ESC-1",
    counterpartyReference: "Customer ESC",
    dueDateUtc: "2026-07-01T00:00:00.000Z",
    totalAmount: 1500,
    currency: "UAH"
  };

  it("parses old records without escalation field", () => {
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
        resolution: null,
        history: []
      })
    );
    const record = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(record);
    assert.equal(record?.escalation, null);
    assert.equal(record?.dispute, null);
    assert.equal(record?.paymentPlan, null);
  });

  it("validates required escalation fields", () => {
    assert.equal(
      validateCollectionEscalationInput({
        reason: "",
        priority: "",
        responsibleTeam: "",
        requestedAction: "",
        dueDate: ""
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "call manager",
        dueDate: "2026-08-10"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "broken_promise",
        priority: "",
        responsibleTeam: "legal",
        requestedAction: "call manager",
        dueDate: "2026-08-10"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "",
        requestedAction: "call manager",
        dueDate: "2026-08-10"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "   ",
        dueDate: "2026-08-10"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "call manager",
        dueDate: ""
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "call manager",
        dueDate: "not-a-date"
      }).ok,
      false
    );
    assert.equal(
      validateCollectionEscalationInput({
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "call manager",
        dueDate: "2026-08-10"
      }).ok,
      true
    );
  });

  it("raises escalation, maps history and workbench eligibility", () => {
    const storage = new MemoryStorage();
    const raised = raiseCollectionEscalation(
      INVOICE_A,
      {
        reason: "repeated_no_response",
        priority: "critical",
        responsibleTeam: "finance",
        requestedAction: "manager outreach",
        dueDate: "2026-08-05"
      },
      { storage, now }
    );
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    assert.equal(raised.record.escalation?.status, "open");
    assert.equal(raised.record.escalation?.priority, "critical");
    assert.equal(classifyPromiseGroup(raised.record, now), "escalated");
    assert.ok(raised.record.history.some((e) => e.type === "case_escalated"));
    assert.equal(
      raised.record.history.filter((e) => e.type === "case_escalated").length,
      1
    );

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(reloaded?.escalation?.dueDate, "2026-08-05");
    assert.equal(reloaded?.escalation?.responsibleTeam, "finance");

    const items = buildPromiseFollowUpItems([invoice], [raised.record], now);
    assert.equal(items[0]?.group, "escalated");
    assert.equal(items[0]?.escalationDueAt, "2026-08-05");
    assert.equal(filterPromiseFollowUps(items, { group: "escalated" }).length, 1);
  });

  it("blocks second active escalation and updates with handoff summary", () => {
    const storage = new MemoryStorage();
    raiseCollectionEscalation(
      INVOICE_A,
      {
        reason: "broken_promise",
        priority: "high",
        responsibleTeam: "finance",
        requestedAction: "recover promise",
        dueDate: "2026-08-12"
      },
      { storage, now }
    );
    const second = raiseCollectionEscalation(
      INVOICE_A,
      {
        reason: "active_dispute",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "legal review",
        dueDate: "2026-08-15"
      },
      { storage, now: new Date(now.getTime() + 1000) }
    );
    assert.equal(second.ok, false);

    const updated = updateCollectionEscalation(
      INVOICE_A,
      {
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "handoff to legal",
        dueDate: "2026-08-18"
      },
      { storage, now: new Date(now.getTime() + 2000) }
    );
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.record.escalation?.id.startsWith("escalation|"), true);
    assert.equal(updated.record.escalation?.responsibleTeam, "legal");
    assert.equal(
      updated.record.history.filter((e) => e.type === "case_escalated").length,
      1
    );
    assert.equal(
      updated.record.history.filter((e) => e.type === "escalation_updated").length,
      1
    );
    const handoffEvent = updated.record.history.find((e) => e.type === "escalation_updated");
    assert.ok(handoffEvent?.description.includes("Finance → Legal"));

    const noop = updateCollectionEscalation(
      INVOICE_A,
      {
        reason: "broken_promise",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "handoff to legal",
        dueDate: "2026-08-18"
      },
      { storage, now: new Date(now.getTime() + 3000) }
    );
    assert.equal(noop.ok, true);
    if (!noop.ok) return;
    assert.equal(
      noop.record.history.filter((e) => e.type === "escalation_updated").length,
      1
    );
  });

  it("requires completion comment and excludes completed from escalated queue", () => {
    const storage = new MemoryStorage();
    raiseCollectionEscalation(
      INVOICE_A,
      {
        reason: "due_date_exceeded",
        priority: "normal",
        responsibleTeam: "collections",
        requestedAction: "collect payment",
        dueDate: "2026-08-01"
      },
      { storage, now }
    );
    assert.equal(validateEscalationCompleteInput({ comment: "   " }).ok, false);
    const completed = completeCollectionEscalation(
      INVOICE_A,
      { comment: "resolved with customer" },
      { storage, now: new Date(now.getTime() + 1000) }
    );
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.record.escalation?.status, "completed");
    assert.equal(completed.record.escalation?.completionComment, "resolved with customer");
    assert.ok(completed.record.history.some((e) => e.type === "escalation_completed"));
    assert.notEqual(classifyPromiseGroup(completed.record, now), "escalated");
    assert.equal(completed.record.resolution, null);
    const items = buildPromiseFollowUpItems([invoice], [completed.record], now);
    assert.equal(filterPromiseFollowUps(items, { group: "escalated" }).length, 0);
  });

  it("marks overdue escalation and preserves coexistence with follow-up and dispute", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-20", note: "base" },
      { storage, now }
    );
    saveCollectionContact(
      INVOICE_A,
      {
        channel: "phone",
        result: "no_answer",
        note: "missed",
        followUpAt: "2026-08-10"
      },
      { storage, now: new Date(now.getTime() + 1000) }
    );
    raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "incorrect_amount",
        description: "amount mismatch",
        responsibleParty: "finance",
        nextReviewAt: "2026-08-10"
      },
      { storage, now: new Date(now.getTime() + 2000) }
    );
    const raised = raiseCollectionEscalation(
      INVOICE_A,
      {
        reason: "active_dispute",
        priority: "critical",
        responsibleTeam: "legal",
        requestedAction: "priority review",
        dueDate: "2026-08-10"
      },
      { storage, now: new Date(now.getTime() + 3000) }
    );
    assert.equal(raised.ok, true);
    if (!raised.ok) return;

    assert.equal(raised.record.nextFollowUpAt, "2026-08-10");
    assert.equal(raised.record.dispute?.nextReviewAt, "2026-08-10");
    assert.equal(raised.record.escalation?.dueDate, "2026-08-10");
    assert.ok(raised.record.history.some((e) => e.type === "contact_logged"));
    assert.ok(raised.record.history.some((e) => e.type === "dispute_raised"));
    assert.ok(raised.record.history.some((e) => e.type === "case_escalated"));

    const candidates = listActiveNextActionCandidates(raised.record);
    assert.equal(candidates.length, 3);
    const selected = resolveNextAction(raised.record);
    assert.equal(selected?.kind, "critical_escalation");
    assert.equal(selected?.date, "2026-08-10");
    assert.equal(resolveNextActionDate(raised.record), "2026-08-10");
    assert.deepEqual(NEXT_ACTION_TIE_BREAK, [
      "critical_escalation",
      "payment_plan_installment",
      "dispute_review",
      "escalation",
      "reminder",
      "contact_follow_up"
    ]);

    const overdueNow = new Date("2026-08-12T12:00:00.000Z");
    assert.equal(isEscalationOverdue(raised.record.escalation, overdueNow), true);
    const items = buildPromiseFollowUpItems([invoice], [raised.record], overdueNow);
    assert.equal(items[0]?.escalationOverdue, true);
    assert.equal(items[0]?.group, "escalated");
  });

  it("uses deterministic tie-break when escalation is not critical", () => {
    const record: PromiseToPayRecord = {
      invoiceId: INVOICE_A,
      promiseDate: "2026-08-20",
      note: "",
      status: "follow_up_required",
      updatedAtUtc: now.toISOString(),
      completedAtUtc: null,
      resolution: null,
      nextFollowUpAt: "2026-08-10",
      lastContact: null,
      dispute: {
        id: "d1",
        status: "open",
        reason: "other",
        description: "x",
        responsibleParty: "finance",
        openedAtUtc: now.toISOString(),
        updatedAtUtc: now.toISOString(),
        nextReviewAt: "2026-08-10",
        resolutionComment: null,
        resolvedAtUtc: null
      },
      escalation: {
        id: "e1",
        status: "open",
        reason: "other",
        priority: "normal",
        responsibleTeam: "operations",
        requestedAction: "check docs",
        dueDate: "2026-08-10",
        openedAtUtc: now.toISOString(),
        updatedAtUtc: now.toISOString(),
        completedAtUtc: null,
        completionComment: null
      },
      paymentPlan: null,
      notes: [],
      reminders: [],
      history: []
    };
    assert.equal(resolveNextAction(record)?.kind, "dispute_review");
  });
});
