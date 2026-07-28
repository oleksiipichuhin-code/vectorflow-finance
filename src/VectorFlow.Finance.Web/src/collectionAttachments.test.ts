import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCollectionAttachment,
  archiveCollectionAttachment,
  ATTACHMENT_MAX_BYTES,
  createCollectionReminder,
  hasActiveCollectionAttachments,
  listActiveCollectionAttachments,
  minimalAttachmentDataUrl,
  readPromiseFromStorage,
  savePromiseToPay,
  storageKeyForInvoice,
  updateCollectionAttachment,
  validateCollectionAttachmentInput
} from "./promiseToPay.ts";
import {
  buildWorkbenchCases,
  buildWorkbenchKpi,
  buildWorkbenchSectionSummaries,
  filterWorkbenchCases
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
const DATA_URL = minimalAttachmentDataUrl();

const invoiceA = {
  id: INVOICE_A,
  documentNumber: "INV-ATT-1",
  counterpartyReference: "Customer Attachments",
  dueDateUtc: "2026-07-01T00:00:00.000Z",
  totalAmount: 420,
  currency: "UAH"
};

const invoiceB = {
  id: INVOICE_B,
  documentNumber: "INV-ATT-2",
  counterpartyReference: "Other Customer",
  dueDateUtc: "2026-07-05T00:00:00.000Z",
  totalAmount: 100,
  currency: "UAH"
};

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "payment-proof.png",
    contentType: "image/png",
    sizeBytes: 70,
    category: "payment_proof" as const,
    description: "Bank transfer screenshot",
    uploadedBy: "Oleksii",
    contentDataUrl: DATA_URL,
    ...overrides
  };
}

describe("collection attachment validation", () => {
  it("requires file name, category, author, and content", () => {
    assert.equal(validateCollectionAttachmentInput({}).ok, false);
    assert.equal(
      validateCollectionAttachmentInput({ fileName: "proof.png" }).ok,
      false
    );
    assert.equal(
      validateCollectionAttachmentInput({
        fileName: "proof.png",
        category: "payment_proof",
        uploadedBy: "Alex"
      }).ok,
      false
    );
    const ok = validateCollectionAttachmentInput(validInput());
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.category, "payment_proof");
      assert.equal(ok.fileName, "payment-proof.png");
    }
  });

  it("rejects oversized payloads", () => {
    const oversized = `data:application/octet-stream;base64,${"A".repeat(
      ATTACHMENT_MAX_BYTES * 2
    )}`;
    const result = validateCollectionAttachmentInput(
      validInput({ contentDataUrl: oversized, sizeBytes: ATTACHMENT_MAX_BYTES + 1 })
    );
    assert.equal(result.ok, false);
  });
});

describe("collection attachments workflow", () => {
  it("creates a case when attaching evidence, then edits and archives with persistence", () => {
    const storage = new MemoryStorage();
    const created = addCollectionAttachment(INVOICE_A, validInput(), {
      storage,
      now: NOW
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    assert.equal(created.record.attachments.length, 1);
    assert.equal(created.record.attachments[0]?.archivedAtUtc, null);
    assert.equal(created.record.history.at(-1)?.type, "attachment_added");

    const reloaded = readPromiseFromStorage(INVOICE_A, storage);
    assert.ok(reloaded);
    assert.equal(listActiveCollectionAttachments(reloaded!.attachments).length, 1);
    assert.equal(hasActiveCollectionAttachments(reloaded!.attachments), true);

    const attachmentId = reloaded!.attachments[0]!.id;
    const updated = updateCollectionAttachment(
      INVOICE_A,
      {
        attachmentId,
        fileName: "payment-proof-v2.png",
        category: "dispute_evidence",
        description: "Updated for dispute pack",
        uploadedBy: "Oleksii",
        contentType: "image/png"
      },
      { storage, now: new Date(NOW.getTime() + 60_000) }
    );
    assert.equal(updated.ok, true);
    if (!updated.ok) {
      return;
    }
    assert.equal(updated.record.attachments[0]?.fileName, "payment-proof-v2.png");
    assert.equal(updated.record.attachments[0]?.category, "dispute_evidence");
    assert.equal(updated.record.history.at(-1)?.type, "attachment_updated");
    assert.ok(updated.record.attachments[0]?.contentDataUrl.startsWith("data:"));

    const archived = archiveCollectionAttachment(INVOICE_A, attachmentId, {
      storage,
      now: new Date(NOW.getTime() + 120_000)
    });
    assert.equal(archived.ok, true);
    if (!archived.ok) {
      return;
    }
    assert.ok(archived.record.attachments[0]?.archivedAtUtc);
    assert.equal(archived.record.history.at(-1)?.type, "attachment_archived");
    assert.equal(listActiveCollectionAttachments(archived.record.attachments).length, 0);

    const again = readPromiseFromStorage(INVOICE_A, storage);
    assert.equal(again?.attachments.length, 1);
    assert.equal(storage.getItem(storageKeyForInvoice(INVOICE_A)) != null, true);
  });

  it("preserves attachments with promise/notes/reminders and rejects editing archived ones", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "promise note" },
      { storage, now: NOW }
    );
    const created = addCollectionAttachment(INVOICE_A, validInput(), {
      storage,
      now: NOW
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    const attachmentId = created.record.attachments[0]!.id;

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
    createCollectionReminder(
      INVOICE_A,
      {
        title: "Review evidence",
        kind: "internal_review",
        dueDate: "2026-07-28"
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
    assert.equal(afterPromise.record.attachments.length, 1);
    assert.equal(afterPromise.record.notes.length, 1);
    assert.equal(afterPromise.record.reminders.length, 1);

    archiveCollectionAttachment(INVOICE_A, attachmentId, { storage, now: NOW });
    const editArchived = updateCollectionAttachment(
      INVOICE_A,
      {
        attachmentId,
        fileName: "should-fail.png",
        category: "other",
        uploadedBy: "Alex",
        description: "nope"
      },
      { storage, now: NOW }
    );
    assert.equal(editArchived.ok, false);

    // Legacy records without attachments field load as empty array
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
        reminders: [],
        history: []
      })
    );
    const legacy = readPromiseFromStorage(INVOICE_B, storage);
    assert.ok(legacy);
    assert.deepEqual(legacy!.attachments, []);
  });

  it("surfaces evidence in workbench KPI/section and case history filters", () => {
    const storage = new MemoryStorage();
    savePromiseToPay(
      INVOICE_A,
      { promiseDate: "2026-08-05", note: "with evidence" },
      { storage, now: NOW }
    );
    addCollectionAttachment(INVOICE_A, validInput(), { storage, now: NOW });
    savePromiseToPay(
      INVOICE_B,
      { promiseDate: "2026-08-06", note: "no evidence" },
      { storage, now: NOW }
    );

    const records = [
      readPromiseFromStorage(INVOICE_A, storage)!,
      readPromiseFromStorage(INVOICE_B, storage)!
    ];
    const cases = buildWorkbenchCases([invoiceA, invoiceB], records, NOW);
    const caseA = cases.find((item) => item.invoiceId === INVOICE_A);
    assert.equal(caseA?.hasActiveAttachments, true);
    assert.equal(caseA?.activeAttachmentsCount, 1);

    const kpi = buildWorkbenchKpi(cases, NOW);
    assert.equal(kpi.evidenceCount, 1);

    const evidence = filterWorkbenchCases(cases, { section: "evidence" });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0]?.invoiceId, INVOICE_A);

    const sections = buildWorkbenchSectionSummaries(cases, {});
    const evidenceSection = sections.find((section) => section.id === "evidence");
    assert.equal(evidenceSection?.count, 1);

    const history = buildCaseHistoryView(records[0]!, {
      type: "attachment_added"
    });
    assert.ok(history.events.some((event) => event.type === "attachment_added"));
  });
});
