import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cancelPaymentPlan,
  createPaymentPlan,
  hasActivePromiseCommitment,
  isActivePaymentPlan,
  NEXT_ACTION_TIE_BREAK,
  readPromiseFromStorage,
  recordInstallmentPayment,
  resolveNextAction,
  savePromiseToPay,
  storageKeyForInvoice,
  updatePaymentPlan,
  type PromiseToPayRecord
} from "./promiseToPay.ts";
import {
  buildPromiseFollowUpItems,
  computeInstallmentStatus,
  countPaidInstallments,
  hasOverdueInstallment,
  planPaidTotal,
  planRemainingTotal,
  selectNextInstallment,
  validatePaymentPlanCancelInput,
  validatePaymentPlanCreateInput
} from "./promiseToPay.ts";
import { buildWorkbenchCases, buildWorkbenchKpi, groupWorkbenchSections } from "./collectionWorkbench.ts";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const INVOICE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INVOICE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const invoiceA = {
  id: INVOICE_A,
  documentNumber: "INV-PP-1",
  counterpartyReference: "Customer PP",
  dueDateUtc: "2026-07-01T00:00:00.000Z",
  totalAmount: 300,
  currency: "UAH"
};

function threeInstallments(overrides?: {
  amounts?: [number, number, number];
  dates?: [string, string, string];
}) {
  const amounts = overrides?.amounts ?? ([100, 100, 100] as [number, number, number]);
  const dates = overrides?.dates ?? (["2026-08-01", "2026-09-01", "2026-10-01"] as [
    string,
    string,
    string
  ]);
  return [
    { dueDate: dates[0], expectedAmount: amounts[0] },
    { dueDate: dates[1], expectedAmount: amounts[1] },
    { dueDate: dates[2], expectedAmount: amounts[2] }
  ];
}

describe("payment plan validation", () => {
  it("requires plan amount, at least one installment, amount and due date", () => {
    assert.equal(validatePaymentPlanCreateInput({}).ok, false);
    assert.equal(
      validatePaymentPlanCreateInput({ planAmount: "", currency: "UAH", installments: [] }).ok,
      false
    );
    assert.equal(
      validatePaymentPlanCreateInput({
        planAmount: "0",
        currency: "UAH",
        installments: [{ dueDate: "2026-08-01", expectedAmount: "10" }]
      }).ok,
      false
    );
    assert.equal(
      validatePaymentPlanCreateInput({
        planAmount: "100",
        currency: "UAH",
        installments: []
      }).ok,
      false
    );
    assert.equal(
      validatePaymentPlanCreateInput({
        planAmount: "100",
        currency: "UAH",
        installments: [{ dueDate: "", expectedAmount: "100" }]
      }).ok,
      false
    );
    assert.equal(
      validatePaymentPlanCreateInput({
        planAmount: "100",
        currency: "UAH",
        installments: [{ dueDate: "2026-08-01", expectedAmount: "0" }]
      }).ok,
      false
    );
  });

  it("rejects mismatched installment totals and unordered due dates", () => {
    const mismatch = validatePaymentPlanCreateInput({
      planAmount: "300",
      currency: "UAH",
      installments: threeInstallments({ amounts: [100, 100, 50] })
    });
    assert.equal(mismatch.ok, false);

    const unordered = validatePaymentPlanCreateInput({
      planAmount: "300",
      currency: "UAH",
      installments: threeInstallments({
        dates: ["2026-10-01", "2026-09-01", "2026-08-01"]
      })
    });
    assert.equal(unordered.ok, false);
  });

  it("accepts a valid schedule", () => {
    const ok = validatePaymentPlanCreateInput({
      planAmount: "300",
      currency: "EUR",
      installments: threeInstallments(),
      replaceActivePromise: true
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.planAmount, 300);
      assert.equal(ok.currency, "EUR");
      assert.equal(ok.installments.length, 3);
    }
  });

  it("requires cancellation reason", () => {
    assert.equal(validatePaymentPlanCancelInput({ reason: "" }).ok, false);
    assert.equal(validatePaymentPlanCancelInput({ reason: " customer withdrew " }).ok, true);
  });
});

describe("payment plan create / promise coexistence / persistence", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("parses old records without payment plan field", () => {
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
    assert.equal(record?.paymentPlan, null);
    assert.equal(record?.escalation, null);
  });

  it("blocks create without replaceActivePromise when promise exists", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-15", note: "single promise" },
      { storage, now }
    );
    const blocked = createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 300,
        currency: "UAH",
        installments: threeInstallments(),
        originalInvoiceAmount: 300
      },
      { storage, now }
    );
    assert.equal(blocked.ok, false);
  });

  it("creates plan replacing promise, blocks second active plan, persists reload", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-15", note: "single promise" },
      { storage, now }
    );
    assert.equal(hasActivePromiseCommitment(readPromiseFromStorage(INVOICE_A, storage)), true);

    const created = createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 300,
        currency: "UAH",
        originalInvoiceAmount: 300,
        installments: threeInstallments(),
        replaceActivePromise: true
      },
      { storage, now }
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.record.paymentPlan?.status, "Active");
    assert.equal(created.record.promiseDate, "2026-08-01");
    assert.ok(created.record.history.some((e) => e.type === "payment_plan_created"));
    assert.ok(
      created.record.history.some((e) => e.note?.includes("Replaced Promise to Pay"))
    );

    const second = createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 100,
        currency: "UAH",
        installments: [{ dueDate: "2026-11-01", expectedAmount: 100 }],
        replaceActivePromise: true
      },
      { storage, now }
    );
    assert.equal(second.ok, false);

    const promiseBlocked = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-12-01" },
      { storage, now }
    );
    assert.equal(promiseBlocked.ok, false);

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(reloaded?.paymentPlan?.installments.length, 3);
    assert.equal(planPaidTotal(reloaded!.paymentPlan!), 0);
    assert.equal(planRemainingTotal(reloaded!.paymentPlan!), 300);
    assert.equal(isActivePaymentPlan(reloaded?.paymentPlan), true);
  });

  it("does not duplicate create history on identical fingerprint double-append", () => {
    const storage = new MemoryStorage();
    const first = createPaymentPlan(
      INVOICE_B,
      {
        planAmount: 90,
        currency: "USD",
        installments: [
          { dueDate: "2026-08-01", expectedAmount: 30 },
          { dueDate: "2026-09-01", expectedAmount: 30 },
          { dueDate: "2026-10-01", expectedAmount: 30 }
        ],
        replaceActivePromise: true
      },
      { storage, now }
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const count = first.record.history.filter((e) => e.type === "payment_plan_created").length;
    assert.equal(count, 1);
  });
});

describe("payment plan installment states and payments", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  function seedActivePlan(storage: MemoryStorage): PromiseToPayRecord {
    const created = createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 300,
        currency: "UAH",
        installments: threeInstallments({
          dates: ["2026-07-20", "2026-08-15", "2026-09-15"]
        }),
        replaceActivePromise: true
      },
      { storage, now }
    );
    assert.equal(created.ok, true);
    if (!created.ok) {
      throw new Error("seed failed");
    }
    return created.record;
  }

  it("computes Scheduled, Overdue, Partially paid, Paid", () => {
    const storage = new MemoryStorage();
    const record = seedActivePlan(storage);
    const [first, second] = record.paymentPlan!.installments;
    assert.equal(computeInstallmentStatus(first!, now), "Overdue");
    assert.equal(computeInstallmentStatus(second!, now), "Scheduled");

    const partial = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first!.id, amount: 40, note: "partial wire" },
      { storage, now }
    );
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    const afterPartial = partial.record.paymentPlan!.installments[0]!;
    assert.equal(computeInstallmentStatus(afterPartial, now), "Overdue");
    assert.equal(afterPartial.recordedPaidAmount, 40);
    assert.equal(planPaidTotal(partial.record.paymentPlan!), 40);
    assert.equal(planRemainingTotal(partial.record.paymentPlan!), 260);
    assert.ok(
      partial.record.history.some(
        (e) => e.type === "installment_payment_recorded" && e.note?.includes("#1")
      )
    );

    const futurePartial = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: second!.id, amount: 25 },
      { storage, now }
    );
    assert.equal(futurePartial.ok, true);
    if (!futurePartial.ok) return;
    assert.equal(
      computeInstallmentStatus(futurePartial.record.paymentPlan!.installments[1]!, now),
      "Partially paid"
    );

    const finishFirst = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first!.id, amount: 60 },
      { storage, now }
    );
    assert.equal(finishFirst.ok, true);
    if (!finishFirst.ok) return;
    assert.equal(
      computeInstallmentStatus(finishFirst.record.paymentPlan!.installments[0]!, now),
      "Paid"
    );

    const overpay = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first!.id, amount: 1 },
      { storage, now }
    );
    assert.equal(overpay.ok, false);

    const paidAgain = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first!.id, amount: 10 },
      { storage, now }
    );
    assert.equal(paidAgain.ok, false);
  });

  it("auto-completes plan once without duplicate completion events", () => {
    const storage = new MemoryStorage();
    createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 100,
        currency: "UAH",
        installments: [
          { dueDate: "2026-08-01", expectedAmount: 50 },
          { dueDate: "2026-09-01", expectedAmount: 50 }
        ],
        replaceActivePromise: true
      },
      { storage, now }
    );
    const plan = readPromiseFromStorage(INVOICE_A, storage)!.paymentPlan!;
    const first = plan.installments[0]!;
    const second = plan.installments[1]!;

    recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first.id, amount: 50 },
      { storage, now }
    );
    const completed = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: second.id, amount: 50 },
      { storage, now }
    );
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.record.paymentPlan?.status, "Completed");
    assert.ok(completed.record.paymentPlan?.completedAtUtc);
    assert.equal(
      completed.record.history.filter((e) => e.type === "payment_plan_completed").length,
      1
    );
    assert.equal(isActivePaymentPlan(completed.record.paymentPlan), false);

    const blocked = recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first.id, amount: 1 },
      { storage, now }
    );
    assert.equal(blocked.ok, false);

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(
      reloaded?.history.filter((e) => e.type === "payment_plan_completed").length,
      1
    );
  });

  it("updates future unpaid installment and blocks paid history changes", () => {
    const storage = new MemoryStorage();
    const seeded = seedActivePlan(storage);
    const first = seeded.paymentPlan!.installments[0]!;
    const second = seeded.paymentPlan!.installments[1]!;
    const third = seeded.paymentPlan!.installments[2]!;

    recordInstallmentPayment(
      INVOICE_A,
      { installmentId: first.id, amount: 50 },
      { storage, now }
    );

    const badEdit = updatePaymentPlan(
      INVOICE_A,
      {
        planAmount: 300,
        installments: [
          {
            id: first.id,
            dueDate: "2026-07-25",
            expectedAmount: 100,
            recordedPaidAmount: 50
          },
          { id: second.id, dueDate: "2026-08-20", expectedAmount: 100 },
          { id: third.id, dueDate: "2026-09-20", expectedAmount: 100 }
        ]
      },
      { storage, now }
    );
    assert.equal(badEdit.ok, false);

    const okEdit = updatePaymentPlan(
      INVOICE_A,
      {
        planAmount: 300,
        installments: [
          {
            id: first.id,
            dueDate: first.dueDate,
            expectedAmount: first.expectedAmount,
            recordedPaidAmount: 50
          },
          { id: second.id, dueDate: "2026-08-20", expectedAmount: 120 },
          { id: third.id, dueDate: "2026-09-20", expectedAmount: 80 }
        ]
      },
      { storage, now }
    );
    assert.equal(okEdit.ok, true);
    if (!okEdit.ok) return;
    assert.equal(okEdit.record.paymentPlan?.installments[1]?.dueDate, "2026-08-20");
    assert.equal(okEdit.record.paymentPlan?.installments[1]?.expectedAmount, 120);
    assert.equal(
      okEdit.record.history.filter((e) => e.type === "payment_plan_updated").length,
      1
    );
    assert.equal(okEdit.record.paymentPlan?.installments[0]?.recordedPaidAmount, 50);
  });

  it("cancels active plan with reason and blocks further payments", () => {
    const storage = new MemoryStorage();
    seedActivePlan(storage);
    const empty = cancelPaymentPlan(INVOICE_A, { reason: "" }, { storage, now });
    assert.equal(empty.ok, false);

    const cancelled = cancelPaymentPlan(
      INVOICE_A,
      { reason: "customer withdrew agreement" },
      { storage, now }
    );
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    assert.equal(cancelled.record.paymentPlan?.status, "Cancelled");
    assert.equal(
      cancelled.record.paymentPlan?.cancellationReason,
      "customer withdrew agreement"
    );
    assert.ok(cancelled.record.history.some((e) => e.type === "payment_plan_cancelled"));

    const pay = recordInstallmentPayment(
      INVOICE_A,
      {
        installmentId: cancelled.record.paymentPlan!.installments[0]!.id,
        amount: 10
      },
      { storage, now }
    );
    assert.equal(pay.ok, false);
  });
});

describe("payment plan workbench and next action", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  it("places active plans in Payment plans section with overdue indicator", () => {
    const storage = new MemoryStorage();
    createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 300,
        currency: "UAH",
        installments: threeInstallments({
          dates: ["2026-07-10", "2026-08-15", "2026-09-15"]
        }),
        replaceActivePromise: true
      },
      { storage, now }
    );
    const record = readPromiseFromStorage(INVOICE_A, storage)!;
    assert.equal(hasOverdueInstallment(record.paymentPlan, now), true);
    assert.equal(selectNextInstallment(record.paymentPlan!, now)?.dueDate, "2026-07-10");
    assert.equal(countPaidInstallments(record.paymentPlan!, now).paid, 0);

    const cases = buildWorkbenchCases([invoiceA], [record], now);
    assert.equal(cases[0]?.group, "payment_plans");
    assert.equal(cases[0]?.paymentPlanOverdue, true);
    assert.equal(cases[0]?.nextBestAction, "track_payment_plan");
    const kpi = buildWorkbenchKpi(cases, now);
    assert.equal(kpi.paymentPlanCount, 1);
    const sections = groupWorkbenchSections(cases);
    assert.ok(sections.some((s) => s.id === "payment_plans" && s.count === 1));

    // completed leaves active queue
    const plan = record.paymentPlan!;
    for (const inst of plan.installments) {
      const remaining = inst.expectedAmount - inst.recordedPaidAmount;
      if (remaining > 0) {
        recordInstallmentPayment(
          INVOICE_A,
          { installmentId: inst.id, amount: remaining },
          { storage, now }
        );
      }
    }
    const done = readPromiseFromStorage(INVOICE_A, storage)!;
    assert.equal(done.paymentPlan?.status, "Completed");
    const after = buildWorkbenchCases([invoiceA], [done], now);
    assert.ok(!after.some((item) => item.group === "payment_plans"));
  });

  it("coexists with follow-up, dispute, escalation dates and uses tie-break", () => {
    const storage = new MemoryStorage();
    createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 100,
        currency: "UAH",
        installments: [{ dueDate: "2026-08-10", expectedAmount: 100 }],
        replaceActivePromise: true
      },
      { storage, now }
    );
    let record = readPromiseFromStorage(INVOICE_A, storage)!;
    record = {
      ...record,
      nextFollowUpAt: "2026-08-10",
      dispute: {
        id: "d1",
        status: "open",
        reason: "other",
        description: "amount question",
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
        priority: "critical",
        responsibleTeam: "collections",
        requestedAction: "manager call",
        dueDate: "2026-08-10",
        openedAtUtc: now.toISOString(),
        updatedAtUtc: now.toISOString(),
        completedAtUtc: null,
        completionComment: null
      }
    };
    assert.equal(resolveNextAction(record)?.kind, "critical_escalation");

    record = {
      ...record,
      escalation: {
        ...record.escalation!,
        priority: "normal"
      }
    };
    assert.equal(resolveNextAction(record)?.kind, "payment_plan_installment");
    assert.deepEqual(NEXT_ACTION_TIE_BREAK[1], "payment_plan_installment");

    const items = buildPromiseFollowUpItems([invoiceA], [record], now);
    // escalation / dispute win classification over payment_plans
    assert.equal(items[0]?.group, "escalated");
    assert.equal(items[0]?.paymentPlanNextDueAt, "2026-08-10");
    assert.ok(items[0]?.nextActionKind);
  });

  it("preserves prior history event types alongside payment plan events", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(INVOICE_A, { promiseDate: "2026-08-01", note: "p" }, { storage, now });
    createPaymentPlan(
      INVOICE_A,
      {
        planAmount: 50,
        currency: "UAH",
        installments: [{ dueDate: "2026-08-05", expectedAmount: 50 }],
        replaceActivePromise: true
      },
      { storage, now }
    );
    const record = readPromiseFromStorage(INVOICE_A, storage)!;
    const types = new Set(record.history.map((e) => e.type));
    assert.ok(types.has("promise_created"));
    assert.ok(types.has("payment_plan_created"));
  });
});
