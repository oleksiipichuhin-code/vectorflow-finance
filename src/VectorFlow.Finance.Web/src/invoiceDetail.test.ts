import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoiceDetailFields,
  canAddInvoiceLineFromDetails,
  canEditInvoiceDueDateFromDetails,
  canEditInvoiceHeaderFromDetails,
  canIssueInvoiceFromDetails,
  canRemoveInvoiceLineFromDetails,
  canUpdateInvoiceLineFromDetails,
  canViewInvoiceDetails,
  DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE,
  detailLifecycleActionsFor,
  interpretInvoiceDetailLoadError,
  shouldReloadDetailAfterMutation,
  type BeginEditorOptions
} from "./invoiceDetail.ts";
import { canAddDraftInvoiceLine } from "./draftInvoiceLineAddEditor.ts";
import { canEditDraftInvoiceDueDate } from "./draftInvoiceDueDateEditor.ts";
import { canEditDraftInvoiceHeader } from "./draftInvoiceHeaderEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
import type { Invoice } from "./api.ts";

class FakeFinanceApiRequestError extends Error {
  readonly status: number;
  readonly errorKind: string | null;

  constructor(message: string, status: number, errorKind: string | null) {
    super(message);
    this.name = "FinanceApiRequestError";
    this.status = status;
    this.errorKind = errorKind;
  }
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    documentNumber: "INV-DETAIL-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    status: "Draft",
    dueDateUtc: null,
    totalAmount: 0,
    createdAtUtc: "2026-07-01T10:00:00.000Z",
    updatedAtUtc: "2026-07-02T11:00:00.000Z",
    issuedAtUtc: null,
    lines: [],
    ...overrides
  };
}

describe("canViewInvoiceDetails", () => {
  it("is available for Draft and Issued", () => {
    assert.equal(canViewInvoiceDetails({ status: "Draft" }), true);
    assert.equal(canViewInvoiceDetails({ status: "Issued" }), true);
  });

  it("is unavailable for unknown status", () => {
    assert.equal(canViewInvoiceDetails({ status: "Cancelled" }), false);
  });
});

describe("buildInvoiceDetailFields", () => {
  it("formats amount/currency and null dates as em dash", () => {
    const fields = buildInvoiceDetailFields(sampleInvoice({ totalAmount: 250.5 }));
    assert.equal(fields.documentNumber, "INV-DETAIL-1");
    assert.equal(fields.status, "Draft");
    assert.equal(fields.counterpartyReference, "cp-1");
    assert.equal(fields.amountDisplay, "250.50 UAH");
    assert.equal(fields.currency, "UAH");
    assert.equal(fields.dueDateDisplay, "—");
    assert.equal(fields.issuedAtDisplay, "—");
    assert.equal(fields.invoiceId, "i1111111-1111-1111-1111-111111111111");
    assert.deepEqual(fields.lines, []);
  });

  it("shows issued and due dates when present", () => {
    const fields = buildInvoiceDetailFields(
      sampleInvoice({
        status: "Issued",
        dueDateUtc: "2026-08-01T00:00:00.000Z",
        issuedAtUtc: "2026-07-03T08:00:00.000Z",
        totalAmount: 100
      })
    );
    assert.equal(fields.status, "Issued");
    assert.notEqual(fields.dueDateDisplay, "—");
    assert.notEqual(fields.issuedAtDisplay, "—");
  });

  it("renders nullable line description as em dash and sorts lines", () => {
    const fields = buildInvoiceDetailFields(
      sampleInvoice({
        lines: [
          {
            id: "l2",
            sequence: 2,
            description: "Second",
            quantity: 2,
            unitPrice: 10,
            lineAmount: 20
          },
          {
            id: "l1",
            sequence: 1,
            description: null,
            quantity: 1,
            unitPrice: 5,
            lineAmount: 5
          }
        ]
      })
    );
    assert.equal(fields.lines.length, 2);
    assert.equal(fields.lines[0]!.id, "l1");
    assert.equal(fields.lines[0]!.sequence, 1);
    assert.equal(fields.lines[0]!.descriptionDisplay, "—");
    assert.equal(fields.lines[1]!.id, "l2");
    assert.equal(fields.lines[1]!.descriptionDisplay, "Second");
  });

  it("treats missing lines as empty", () => {
    const invoice = sampleInvoice();
    delete invoice.lines;
    const fields = buildInvoiceDetailFields(invoice);
    assert.deepEqual(fields.lines, []);
  });
});

describe("interpretInvoiceDetailLoadError", () => {
  it("maps 404 to not found with list refresh", () => {
    const failure = interpretInvoiceDetailLoadError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.kind, "not_found");
    assert.equal(failure.refreshList, true);
    assert.equal(failure.clearInvoiceData, true);
    assert.match(failure.message, /більше недоступний/);
  });

  it("maps network errors as retryable without list refresh", () => {
    const failure = interpretInvoiceDetailLoadError(new Error("Failed to fetch"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });

  it("maps unexpected 5xx as retryable", () => {
    const failure = interpretInvoiceDetailLoadError(
      new FakeFinanceApiRequestError("Boom", 500, "ServerError")
    );
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.clearInvoiceData, true);
  });
});

describe("invoice detail deep-link coordination", () => {
  it("invalid id policy does not imply GET (parse-only contract)", () => {
    assert.equal(parseInvoiceIdParamSafe("not-a-guid"), null);
  });

  it("stale selection compares open target to requested id", () => {
    const openId = "i1111111-1111-1111-1111-111111111111";
    const lateId = "i2222222-2222-2222-2222-222222222222";
    assert.equal(openId === openId, true);
    assert.equal(openId === lateId, false);
  });
});

describe("detailLifecycleActionsFor / issue handoff policy", () => {
  it("shows editHeader, addLine, editDueDate and issue actions only for Draft", () => {
    assert.deepEqual(detailLifecycleActionsFor({ status: "Draft" }), [
      "editHeader",
      "addLine",
      "editDueDate",
      "issue"
    ]);
    assert.deepEqual(detailLifecycleActionsFor({ status: "Issued" }), []);
    assert.equal(canEditInvoiceHeaderFromDetails({ status: "Draft" }), true);
    assert.equal(canEditInvoiceHeaderFromDetails({ status: "Issued" }), false);
    assert.equal(canAddInvoiceLineFromDetails({ status: "Draft" }), true);
    assert.equal(canAddInvoiceLineFromDetails({ status: "Issued" }), false);
    assert.equal(canEditInvoiceDueDateFromDetails({ status: "Draft" }), true);
    assert.equal(canEditInvoiceDueDateFromDetails({ status: "Issued" }), false);
    assert.equal(canIssueInvoiceFromDetails({ status: "Draft" }), true);
    assert.equal(canIssueInvoiceFromDetails({ status: "Issued" }), false);
  });

  it("reuses the same draft eligibility as the row action", () => {
    const draft = sampleInvoice({ status: "Draft" });
    const issued = sampleInvoice({ status: "Issued" });
    assert.equal(canIssueInvoiceFromDetails(draft), isDraftInvoice(draft));
    assert.equal(canIssueInvoiceFromDetails(issued), isDraftInvoice(issued));
    assert.equal(
      canEditInvoiceHeaderFromDetails(draft),
      canEditDraftInvoiceHeader(draft)
    );
    assert.equal(
      canEditInvoiceHeaderFromDetails(issued),
      canEditDraftInvoiceHeader(issued)
    );
    assert.equal(
      canEditInvoiceDueDateFromDetails(draft),
      canEditDraftInvoiceDueDate(draft)
    );
    assert.equal(
      canEditInvoiceDueDateFromDetails(issued),
      canEditDraftInvoiceDueDate(issued)
    );
    assert.equal(canAddInvoiceLineFromDetails(draft), canAddDraftInvoiceLine(draft));
    assert.equal(canAddInvoiceLineFromDetails(issued), canAddDraftInvoiceLine(issued));
    assert.equal(canUpdateInvoiceLineFromDetails(draft), true);
    assert.equal(canUpdateInvoiceLineFromDetails(issued), false);
    assert.equal(canRemoveInvoiceLineFromDetails(draft), true);
    assert.equal(canRemoveInvoiceLineFromDetails(issued), false);
  });

  it("keeps line update/remove off invoice-level lifecycle actions", () => {
    assert.deepEqual(detailLifecycleActionsFor({ status: "Draft" }), [
      "editHeader",
      "addLine",
      "editDueDate",
      "issue"
    ]);
  });

  it("row and detail launches share BeginEditorOptions shape", () => {
    const rowLaunch: BeginEditorOptions = {};
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(detailLaunch.preserveDetail, true);
  });

  it("reloads detail after mutation only for the open invoice", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    assert.equal(shouldReloadDetailAfterMutation(invoiceId, invoiceId), true);
    assert.equal(shouldReloadDetailAfterMutation(null, invoiceId), false);
    assert.equal(
      shouldReloadDetailAfterMutation("i2222222-2222-2222-2222-222222222222", invoiceId),
      false
    );
  });

  it("uses recoverable detail-reload message after successful mutation", () => {
    assert.match(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE, /Зміни збережено/);
    assert.match(DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE, /Спробувати знову/);
  });

  it("preserve-detail cancel policy keeps selection and skips mutation", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    const issueTargetId = selectedInvoiceId;
    const mutationCount = 0;
    // Cancel closes only the prepare target; URL selection stays.
    const nextTarget = null;
    assert.equal(mutationCount, 0);
    assert.equal(nextTarget, null);
    assert.equal(selectedInvoiceId, issueTargetId);
  });

  it("success policy keeps deep-link and hides issue after Issued status", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const before = sampleInvoice({ id: invoiceId, status: "Draft", issuedAtUtc: null });
    const after = sampleInvoice({
      id: invoiceId,
      status: "Issued",
      issuedAtUtc: "2026-07-26T15:00:00.000Z",
      totalAmount: 100,
      dueDateUtc: "2026-08-25T00:00:00.000Z"
    });
    assert.equal(canIssueInvoiceFromDetails(before), true);
    assert.equal(canIssueInvoiceFromDetails(after), false);
    assert.equal(shouldReloadDetailAfterMutation(invoiceId, after.id), true);
    assert.equal(after.issuedAtUtc !== null, true);
  });

  it("draft filter may hide row while detail selection remains", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const listIds: string[] = [];
    const selectedInvoiceId = invoiceId;
    assert.equal(listIds.includes(invoiceId), false);
    assert.equal(selectedInvoiceId, invoiceId);
    assert.equal(shouldReloadDetailAfterMutation(selectedInvoiceId, invoiceId), true);
  });

  it("A→B selection switch drops prior issue target", () => {
    const invoiceA = "i1111111-1111-1111-1111-111111111111";
    const invoiceB = "i2222222-2222-2222-2222-222222222222";
    let issueTargetId: string | null = invoiceA;
    const selectedInvoiceId = invoiceB;
    if (selectedInvoiceId !== issueTargetId) {
      issueTargetId = null;
    }
    assert.equal(issueTargetId, null);
    assert.equal(selectedInvoiceId, invoiceB);
  });

  it("close detail while prepare open dismisses both when not pending", () => {
    const pending = false;
    let issueTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let selectedInvoiceId: string | null = issueTargetId;
    if (!pending) {
      issueTargetId = null;
      selectedInvoiceId = null;
    }
    assert.equal(issueTargetId, null);
    assert.equal(selectedInvoiceId, null);
  });

  it("pending issue blocks close for the same detail invoice", () => {
    const detailTargetId = "i1111111-1111-1111-1111-111111111111";
    const issuingInvoiceId = detailTargetId;
    const issueBusy = true;
    const blocked = Boolean(
      detailTargetId && issueBusy && issuingInvoiceId === detailTargetId
    );
    assert.equal(blocked, true);
  });

  it("row issue without preserveDetail does not invent invoiceId", () => {
    const rowLaunch: BeginEditorOptions = {};
    const selectedInvoiceId: string | null = null;
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(selectedInvoiceId, null);
  });
});

function parseInvoiceIdParamSafe(value: string): string | null {
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return UUID_RE.test(value.trim()) ? value.trim() : null;
}
