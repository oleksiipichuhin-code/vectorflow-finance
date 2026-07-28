import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cancelCollectionReminder,
  completeCollectionReminder,
  createCollectionReminder,
  hasDueOpenReminders,
  listOpenCollectionReminders,
  readPromiseFromStorage,
  savePromiseToPay,
  storageKeyForInvoice,
  updateCollectionReminder,
  validateCollectionReminderInput
} from "./promiseToPay.ts";
import {
  buildWorkbenchCases,
  buildWorkbenchKpi,
  buildWorkbenchSectionSummaries,
  filterWorkbenchCases,
  resolveNextBestAction
} from "./collectionWorkbench.ts";
import { buildCaseHistoryView } from "./collectionCaseHistory.ts";
import { addCollectionNote } from "./promiseToPay.ts";

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
const NOW = new Date("2026-07-28T12:00:00.000+03:00");

const invoiceA = {
  id: INVOICE_A,
  documentNumber: "INV-REM-1",
  counterpartyReference: "Customer Reminders",
  dueDateUtc: "2026-07-01T00:00:00.000Z",
  totalAmount: 420,
  currency: "UAH"
};

const invoiceB = {
  id: INVOICE_B,
  documentNumber: "INV-REM-2",
  counterpartyReference: "Other Customer",
  dueDateUtc: "2026-07-05T00:00:00.000Z",
  totalAmount: 100,
  currency: "UAH"
};

describe("collection reminder validation", () => {
  it("requires title, kind, and due date", () => {
    assert.equal(validateCollectionReminderInput({}).ok, false);
    assert.equal(validateCollectionReminderInput({ title: "Call AP" }).ok, false);
    assert.equal(
      validateCollectionReminderInput({
        title: "Call AP",
        kind: "callback",
        dueDate: "28-07-2026"
      }).ok,
      false
    );
    const ok = validateCollectionReminderInput({
      title: "Call AP desk",
      kind: "callback",
      dueDate: "2026-07-28",
      note: "Ask for wire confirmation"
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.kind, "callback");
      assert.equal(ok.dueDate, "2026-07-28");
    }
  });
});

describe("collection reminders workflow", () => {
  it("creates a case when scheduling the first reminder, then reschedules, completes, and cancels with persistence", () => {
    const storage = new MemoryStorage();
    const created = createCollectionReminder(
      INVOICE_A,
      {
        title: "Call AP desk",
        kind: "callback",
        dueDate: "2026-07-28",
        note: "Confirm Friday wire"
      },
      { storage, now: NOW }
    );
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    assert.equal(created.record.reminders.length, 1);
    assert.equal(created.record.reminders[0]?.status, "open");
    assert.equal(created.record.history.at(-1)?.type, "reminder_created");
    assert.equal(created.record.nextFollowUpAt, null);

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(reloaded);
    assert.equal(listOpenCollectionReminders(reloaded!.reminders).length, 1);
    assert.equal(hasDueOpenReminders(reloaded!.reminders, NOW), true);

    const reminderId = reloaded!.reminders[0]!.id;
    const updated = updateCollectionReminder(
      INVOICE_A,
      {
        reminderId,
        title: "Call AP desk — rescheduled",
        kind: "check_payment",
        dueDate: "2026-07-30",
        note: "Bank holiday delay"
      },
      { storage, now: new Date(NOW.getTime() + 60_000) }
    );
    assert.equal(updated.ok, true);
    if (!updated.ok) {
      return;
    }
    assert.equal(updated.record.reminders[0]?.dueDate, "2026-07-30");
    assert.equal(updated.record.reminders[0]?.kind, "check_payment");
    assert.equal(updated.record.history.at(-1)?.type, "reminder_updated");
    assert.equal(hasDueOpenReminders(updated.record.reminders, NOW), false);

    const completed = completeCollectionReminder(INVOICE_A, reminderId, {
      storage,
      now: new Date(NOW.getTime() + 120_000)
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) {
      return;
    }
    assert.equal(completed.record.reminders[0]?.status, "completed");
    assert.equal(completed.record.history.at(-1)?.type, "reminder_completed");
    assert.equal(listOpenCollectionReminders(completed.record.reminders).length, 0);

    const second = createCollectionReminder(
      INVOICE_A,
      {
        title: "Send statement",
        kind: "send_documents",
        dueDate: "2026-07-28"
      },
      { storage, now: new Date(NOW.getTime() + 180_000) }
    );
    assert.equal(second.ok, true);
    if (!second.ok) {
      return;
    }
    const cancelId = second.record.reminders.find((item) => item.status === "open")!.id;
    const cancelled = cancelCollectionReminder(INVOICE_A, cancelId, {
      storage,
      now: new Date(NOW.getTime() + 240_000)
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) {
      return;
    }
    assert.equal(
      cancelled.record.reminders.find((item) => item.id === cancelId)?.status,
      "cancelled"
    );
    assert.equal(cancelled.record.history.at(-1)?.type, "reminder_cancelled");

    const again = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(again?.reminders.length, 2);
    assert.equal(storage.getItem(storageKeyForInvoice(INVOICE_A)) != null, true);
  });

  it("preserves reminders with promise/notes and rejects editing terminal reminders", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "promise note" },
      { storage, now: NOW }
    );
    const created = createCollectionReminder(
      INVOICE_A,
      {
        title: "Internal review",
        kind: "internal_review",
        dueDate: "2026-07-28"
      },
      { storage, now: NOW }
    );
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const reminderId = created.record.reminders[0]!.id;

    addCollectionNote(
      INVOICE_A,
      {
        body: "Handoff note stays",
        author: "Alex",
        category: "handoff",
        pinned: true
      },
      { storage, now: NOW }
    );

    const afterPromise = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-10", note: "updated promise" },
      { storage, now: NOW, preserveStatus: true }
    );
    assert.equal(afterPromise.ok, true);
    if (!afterPromise.ok) {
      return;
    }
    assert.equal(afterPromise.record.reminders.length, 1);
    assert.equal(afterPromise.record.notes.length, 1);
    assert.equal(afterPromise.record.nextFollowUpAt, null);

    completeCollectionReminder(INVOICE_A, reminderId, { storage, now: NOW });
    const editDone = updateCollectionReminder(
      INVOICE_A,
      {
        reminderId,
        title: "should fail",
        kind: "other",
        dueDate: "2026-08-01"
      },
      { storage, now: NOW }
    );
    assert.equal(editDone.ok, false);

    const cancelDone = cancelCollectionReminder(INVOICE_A, reminderId, {
      storage,
      now: NOW
    });
    assert.equal(cancelDone.ok, false);

    // Legacy records without reminders field load as empty array
    const key = storageKeyForInvoice(INVOICE_B);
    storage.setItem(
      key,
      JSON.stringify({
        invoiceId: INVOICE_B,
        promiseDate: "2026-08-01",
        note: "legacy",
        status: "awaiting",
        updatedAtUtc: NOW.toISOString(),
        completedAtUtc: null,
        resolution: null,
        nextFollowUpAt: null,
        lastContact: null,
        dispute: null,
        escalation: null,
        paymentPlan: null,
        notes: [],
        history: []
      })
    );
    const legacy = readPromiseFromStorage(INVOICE_B, storage);
    assert.ok(legacy);
    assert.deepEqual(legacy!.reminders, []);
  });

  it("surfaces due reminders in workbench KPI/section and case history filters", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "upcoming with reminder" },
      { storage, now: NOW }
    );
    createCollectionReminder(
      INVOICE_A,
      {
        title: "Callback today",
        kind: "callback",
        dueDate: "2026-07-28"
      },
      { storage, now: NOW }
    );
    savePromiseToPay(
      INVOICE_B,
      { promiseDate: "2026-08-06", note: "no reminder" },
      { storage, now: NOW }
    );

    const records = [
      readPromiseFromStorage(INVOICE_A, storage)!,
      readPromiseFromStorage(INVOICE_B, storage)!
    ];
    const cases = buildWorkbenchCases([invoiceA, invoiceB], records, NOW);
    const caseA = cases.find((item) => item.invoiceId === INVOICE_A);
    assert.equal(caseA?.hasDueOpenReminders, true);
    assert.equal(caseA?.openRemindersCount, 1);
    assert.equal(resolveNextBestAction(caseA!), "complete_reminder");

    const kpi = buildWorkbenchKpi(cases, NOW);
    assert.equal(kpi.reminderDueCount, 1);

    const reminders = filterWorkbenchCases(cases, { section: "reminders" });
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0]?.invoiceId, INVOICE_A);

    const sections = buildWorkbenchSectionSummaries(cases, {});
    const reminderSection = sections.find((section) => section.id === "reminders");
    assert.equal(reminderSection?.count, 1);

    const history = buildCaseHistoryView(records[0]!, {
      type: "reminder_created"
    });
    assert.ok(history.events.some((event) => event.type === "reminder_created"));
  });
});
