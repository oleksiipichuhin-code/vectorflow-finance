import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendActivityEvent,
  buildCaseHistorySummary,
  buildCaseHistoryView,
  buildCaseTimeline,
  contactChannelLabel,
  createActivityEvent,
  filterCaseTimeline,
  parseHistoryEventTypeParam,
  parseHistoryFlagParam,
  sanitizeActivityHistory
} from "./collectionCaseHistory.ts";
import {
  applyCollectionResolution,
  raiseCollectionDispute,
  readPromiseFromStorage,
  resolveCollectionDispute,
  saveCollectionContact,
  savePromiseToPay,
  storageKeyForInvoice,
  updateCollectionDispute,
  updatePromiseStatus
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
const NOW = new Date("2026-07-28T12:00:00.000+03:00");

describe("collectionCaseHistory events", () => {
  it("records promise created and updated", () => {
    const storage = new MemoryStorage();
    const created = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "first" },
      { storage, now: NOW }
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.record.history.some((e) => e.type === "promise_created"), true);

    const updated = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "moved" },
      { storage, now: new Date(NOW.getTime() + 1000), preserveStatus: true }
    );
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    const types = updated.record.history.map((e) => e.type);
    assert.ok(types.includes("promise_created"));
    assert.ok(types.includes("promise_updated"));
  });

  it("synthesizes broken promise and orders newest first", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-07-20", note: "late" },
      { storage, now: NOW }
    );
    const record = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(record);
    const timeline = buildCaseTimeline(record, NOW);
    assert.equal(timeline.some((e) => e.type === "promise_broken"), true);
    for (let i = 1; i < timeline.length; i += 1) {
      assert.ok(timeline[i - 1]!.atUtc >= timeline[i]!.atUtc);
    }
  });

  it("records contacted, follow-up, completed/paid", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(INVOICE_A, { promiseDate: "2026-08-01" }, { storage, now: NOW });
    updatePromiseStatus(INVOICE_A, "contacted", {
      storage,
      now: new Date(NOW.getTime() + 1000)
    });
    updatePromiseStatus(INVOICE_A, "follow_up_required", {
      storage,
      now: new Date(NOW.getTime() + 2000)
    });
    const completed = updatePromiseStatus(INVOICE_A, "completed", {
      storage,
      now: new Date(NOW.getTime() + 3000)
    });
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    const types = new Set(completed.record.history.map((e) => e.type));
    assert.ok(types.has("contacted"));
    assert.ok(types.has("follow_up_required"));
    assert.ok(types.has("completed"));
    assert.ok(types.has("paid"));
  });

  it("records paid, partially paid, escalated, disputed, unable to contact", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(INVOICE_A, { promiseDate: "2026-08-01" }, { storage, now: NOW });

    const partial = applyCollectionResolution(
      INVOICE_A,
      {
        kind: "partially_paid",
        paymentDate: "2026-07-28",
        paidAmount: 40,
        remainingAmount: 60,
        note: "partial note"
      },
      { storage, now: new Date(NOW.getTime() + 1000) }
    );
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    assert.ok(partial.record.history.some((e) => e.type === "partially_paid"));

    const disputed = applyCollectionResolution(
      INVOICE_A,
      { kind: "disputed", reason: "wrong amount", note: "dispute" },
      { storage, now: new Date(NOW.getTime() + 2000) }
    );
    assert.equal(disputed.ok, true);
    if (!disputed.ok) return;
    assert.ok(disputed.record.history.some((e) => e.type === "disputed"));

    // Reset with new promise then escalate / unable / paid
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-10", note: "reopen" },
      { storage, now: new Date(NOW.getTime() + 3000) }
    );
    applyCollectionResolution(
      INVOICE_A,
      { kind: "escalated", reason: "manager" },
      { storage, now: new Date(NOW.getTime() + 4000) }
    );
    applyCollectionResolution(
      INVOICE_A,
      { kind: "unable_to_contact", note: "no answer" },
      { storage, now: new Date(NOW.getTime() + 5000) }
    );
    const paid = applyCollectionResolution(
      INVOICE_A,
      { kind: "paid", paymentDate: "2026-07-28", note: "done" },
      { storage, now: new Date(NOW.getTime() + 6000) }
    );
    assert.equal(paid.ok, true);
    if (!paid.ok) return;
    const types = new Set(paid.record.history.map((e) => e.type));
    assert.ok(types.has("escalated"));
    assert.ok(types.has("unable_to_contact"));
    assert.ok(types.has("paid"));
    assert.ok(types.has("completed"));
  });

  it("prevents duplicate events and ignores corrupted storage", () => {
    const event = createActivityEvent({
      type: "contacted",
      atUtc: NOW.toISOString(),
      promiseDate: "2026-08-01",
      note: "x"
    });
    const once = appendActivityEvent([], event);
    const twice = appendActivityEvent(once, event);
    assert.equal(once.length, 1);
    assert.equal(twice.length, 1);

    const cleaned = sanitizeActivityHistory([
      event,
      { type: "nope", atUtc: NOW.toISOString() },
      "bad",
      null,
      event
    ]);
    assert.equal(cleaned.length, 1);

    const storage = new MemoryStorage();
    storage.setItem(storageKeyForInvoice(INVOICE_A), "{broken-json");
    assert.equal(readPromiseFromStorage(INVOICE_A, storage), null);
    assert.deepEqual(buildCaseTimeline(null), []);
  });

  it("filters by search and type, collapses long history, and builds summary", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "alpha note" },
      { storage, now: NOW }
    );
    for (let i = 1; i <= 6; i += 1) {
      updatePromiseStatus(INVOICE_A, "contacted", {
        storage,
        now: new Date(NOW.getTime() + i * 1000)
      });
      updatePromiseStatus(INVOICE_A, "follow_up_required", {
        storage,
        now: new Date(NOW.getTime() + i * 1000 + 500)
      });
    }
    const record = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(record);
    const all = buildCaseTimeline(record, NOW);
    const searched = filterCaseTimeline(all, { search: "alpha" });
    assert.ok(searched.length >= 1);
    const typed = filterCaseTimeline(all, { type: "contacted" });
    assert.ok(typed.every((e) => e.type === "contacted"));

    const collapsed = buildCaseHistoryView(record, { expanded: false, collapsedLimit: 5 }, NOW);
    assert.equal(collapsed.collapsed, true);
    assert.equal(collapsed.visibleCount, 5);
    assert.ok(collapsed.totalCount > 5);

    const expanded = buildCaseHistoryView(record, { expanded: true }, NOW);
    assert.equal(expanded.collapsed, false);
    assert.equal(expanded.visibleCount, expanded.totalCount);

    const summary = buildCaseHistorySummary(record, all);
    assert.equal(summary.currentPromise, record.promiseDate);
    assert.ok(summary.totalFollowUps >= 1);
    assert.ok(summary.totalPromises >= 1);
    assert.ok(summary.lastContactAtUtc);
  });

  it("parses history URL helpers", () => {
    assert.equal(parseHistoryEventTypeParam("contacted"), "contacted");
    assert.equal(parseHistoryEventTypeParam("contact_logged"), "contact_logged");
    assert.equal(parseHistoryEventTypeParam("dispute_raised"), "dispute_raised");
    assert.equal(parseHistoryEventTypeParam("nope"), "");
    assert.equal(parseHistoryFlagParam("1"), true);
    assert.equal(parseHistoryFlagParam("0"), false);
  });

  it("maps contact_logged into timeline with channel, result, follow-up", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "base" },
      { storage, now: NOW }
    );
    const contact = saveCollectionContact(
      INVOICE_A,
      {
        channel: "phone",
        result: "left_message",
        note: "callback requested",
        followUpAt: "2026-08-03"
      },
      { storage, now: new Date(NOW.getTime() + 1000) }
    );
    assert.equal(contact.ok, true);
    if (!contact.ok) return;

    const timeline = buildCaseTimeline(contact.record, NOW);
    assert.equal(timeline[0]?.type, "contact_logged");
    assert.equal(timeline[0]?.contactChannel, "phone");
    assert.equal(timeline[0]?.contactResult, "left_message");
    assert.equal(timeline[0]?.followUpAt, "2026-08-03");
    assert.match(
      timeline[0]?.description ?? "",
      new RegExp(contactChannelLabel("phone"), "i")
    );
    assert.ok(timeline.some((event) => event.type === "promise_created"));

    const ordered = timeline.map((event) => event.atUtc);
    assert.deepEqual(
      ordered,
      [...ordered].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    );
  });

  it("maps dispute lifecycle into append-only history", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "base" },
      { storage, now: NOW }
    );
    const raised = raiseCollectionDispute(
      INVOICE_A,
      {
        reason: "incorrect_amount",
        description: "overcharged",
        responsibleParty: "finance",
        nextReviewAt: "2026-08-09"
      },
      { storage, now: new Date(NOW.getTime() + 1000) }
    );
    assert.equal(raised.ok, true);
    if (!raised.ok) return;
    updateCollectionDispute(
      INVOICE_A,
      {
        reason: "incorrect_amount",
        description: "overcharged by 50",
        responsibleParty: "operations",
        nextReviewAt: "2026-08-11"
      },
      { storage, now: new Date(NOW.getTime() + 2000) }
    );
    const resolved = resolveCollectionDispute(
      INVOICE_A,
      { comment: "credit note issued" },
      { storage, now: new Date(NOW.getTime() + 3000) }
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    const timeline = buildCaseTimeline(resolved.record, NOW);
    const types = timeline.map((e) => e.type);
    assert.ok(types.includes("dispute_raised"));
    assert.ok(types.includes("dispute_updated"));
    assert.ok(types.includes("dispute_resolved"));
    assert.ok(types.includes("promise_created"));
    assert.equal(timeline[0]?.type, "dispute_resolved");
  });
});
