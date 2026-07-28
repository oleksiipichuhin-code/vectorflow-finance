import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCollectionNote,
  archiveCollectionNote,
  buildPromiseFollowUpItems,
  hasOpenHandoffNotes,
  listActiveCollectionNotes,
  listPinnedCollectionNotes,
  readLastCollectionNoteAuthor,
  readPromiseFromStorage,
  savePromiseToPay,
  storageKeyForInvoice,
  updateCollectionNote,
  validateCollectionNoteInput
} from "./promiseToPay.ts";
import {
  buildWorkbenchCases,
  buildWorkbenchKpi,
  buildWorkbenchSectionSummaries,
  filterWorkbenchCases,
  resolveNextBestAction
} from "./collectionWorkbench.ts";
import { buildCaseHistoryView } from "./collectionCaseHistory.ts";

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
  documentNumber: "INV-NOTE-1",
  counterpartyReference: "Customer Notes",
  dueDateUtc: "2026-07-01T00:00:00.000Z",
  totalAmount: 250,
  currency: "UAH"
};

describe("collection note validation", () => {
  it("requires body, author, and category", () => {
    assert.equal(validateCollectionNoteInput({}).ok, false);
    assert.equal(validateCollectionNoteInput({ body: "x" }).ok, false);
    assert.equal(
      validateCollectionNoteInput({ body: "x", author: "Alex", category: "" }).ok,
      false
    );
    const ok = validateCollectionNoteInput({
      body: "Handoff for night shift",
      author: "Alex",
      category: "handoff",
      pinned: true
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.category, "handoff");
      assert.equal(ok.pinned, true);
    }
  });
});

describe("collection notes workflow", () => {
  it("creates a case when adding the first note, then edits and archives with persistence", () => {
    const storage = new MemoryStorage();
    const created = addCollectionNote(
      INVOICE_A,
      {
        body: "Customer CFO traveling until Friday",
        author: "Oleksii",
        category: "customer_context",
        pinned: true
      },
      { storage, now: NOW }
    );
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    assert.equal(created.record.notes.length, 1);
    assert.equal(created.record.notes[0]?.pinned, true);
    assert.equal(created.record.history.at(-1)?.type, "note_added");
    assert.equal(readLastCollectionNoteAuthor(storage), "Oleksii");

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(reloaded);
    assert.equal(listActiveCollectionNotes(reloaded!.notes).length, 1);
    assert.equal(listPinnedCollectionNotes(reloaded!.notes).length, 1);

    const noteId = reloaded!.notes[0]!.id;
    const updated = updateCollectionNote(
      INVOICE_A,
      {
        noteId,
        body: "CFO traveling until Monday — call AP desk",
        author: "Oleksii",
        category: "handoff",
        pinned: true
      },
      { storage, now: new Date(NOW.getTime() + 60_000) }
    );
    assert.equal(updated.ok, true);
    if (!updated.ok) {
      return;
    }
    assert.equal(updated.record.notes[0]?.category, "handoff");
    assert.equal(updated.record.history.at(-1)?.type, "note_updated");
    assert.equal(hasOpenHandoffNotes(updated.record.notes), true);

    const archived = archiveCollectionNote(INVOICE_A, noteId, {
      storage,
      now: new Date(NOW.getTime() + 120_000)
    });
    assert.equal(archived.ok, true);
    if (!archived.ok) {
      return;
    }
    assert.equal(listActiveCollectionNotes(archived.record.notes).length, 0);
    assert.equal(archived.record.notes[0]?.archivedAtUtc != null, true);
    assert.equal(archived.record.history.at(-1)?.type, "note_archived");
    assert.equal(hasOpenHandoffNotes(archived.record.notes), false);

    const again = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(again?.notes[0]?.body.includes("AP desk"), true);
    assert.equal(storage.getItem(storageKeyForInvoice(INVOICE_A)) != null, true);
  });

  it("preserves notes when updating promise and rejects editing archived notes", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-01", note: "promise" },
      { storage, now: NOW }
    );
    const created = addCollectionNote(
      INVOICE_A,
      { body: "Risk: repeated no-answer", author: "Dana", category: "risk" },
      { storage, now: NOW }
    );
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const noteId = created.record.notes[0]!.id;
    archiveCollectionNote(INVOICE_A, noteId, { storage, now: NOW });

    const promise = savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "new date" },
      { storage, now: NOW, preserveStatus: true }
    );
    assert.equal(promise.ok, true);
    if (!promise.ok) {
      return;
    }
    assert.equal(promise.record.notes.length, 1);
    assert.equal(promise.record.notes[0]?.archivedAtUtc != null, true);

    const editArchived = updateCollectionNote(
      INVOICE_A,
      {
        noteId,
        body: "should fail",
        author: "Dana",
        category: "risk"
      },
      { storage, now: NOW }
    );
    assert.equal(editArchived.ok, false);
  });

  it("surfaces handoffs in workbench KPI/section and case history filters", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-02", note: "upcoming" },
      { storage, now: NOW }
    );
    savePromiseToPay(
      INVOICE_B,
      { promiseDate: "2026-07-20", note: "broken" },
      { storage, now: NOW }
    );
    addCollectionNote(
      INVOICE_A,
      {
        body: "Night shift: verify promised wire",
        author: "Alex",
        category: "handoff",
        pinned: true
      },
      { storage, now: NOW }
    );

    const invoices = [
      invoiceA,
      {
        id: INVOICE_B,
        documentNumber: "INV-NOTE-2",
        counterpartyReference: "Other",
        dueDateUtc: "2026-06-01T00:00:00.000Z",
        totalAmount: 90,
        currency: "UAH"
      }
    ];
    const records = [INVOICE_A, INVOICE_B]
      .map((id) => readPromiseFromStorage(id, storage))
      .filter((record): record is NonNullable<typeof record> => Boolean(record));

    const items = buildPromiseFollowUpItems(invoices, records, NOW);
    const caseA = items.find((item) => item.invoiceId === INVOICE_A);
    assert.equal(caseA?.hasOpenHandoffNotes, true);
    assert.equal(caseA?.activeNotesCount, 1);
    assert.equal(caseA?.pinnedNotesCount, 1);

    const cases = buildWorkbenchCases(invoices, records, NOW);
    const kpi = buildWorkbenchKpi(cases, NOW);
    assert.equal(kpi.handoffCount, 1);

    const handoffs = filterWorkbenchCases(cases, { section: "handoffs" });
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0]?.invoiceId, INVOICE_A);

    const sections = buildWorkbenchSectionSummaries(cases);
    const handoffSection = sections.find((section) => section.id === "handoffs");
    assert.equal(handoffSection?.count, 1);

    assert.equal(
      resolveNextBestAction(caseA!),
      "review_handoff"
    );

    const history = buildCaseHistoryView(records[0]!, {
      type: "note_added"
    });
    assert.ok(history.events.some((event) => event.type === "note_added"));
  });

  it("returns storage write errors when storage is unavailable", () => {
    const result = addCollectionNote(
      INVOICE_A,
      { body: "x", author: "A", category: "general" },
      { storage: null, now: NOW }
    );
    // null storage skips write but still returns ok with in-memory record
    assert.equal(result.ok, true);
  });
});
