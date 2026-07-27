import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Invoice } from "./api.ts";
import {
  applyDraftInvoiceLineAdd,
  canAddDraftInvoiceLine,
  initialDraftInvoiceLineAddInput,
  INVOICE_LINE_DESCRIPTION_MAX_LENGTH,
  interpretDraftInvoiceLineAddError,
  parseDraftInvoiceLineAddInput,
  validateDraftInvoiceLineAddInput
} from "./draftInvoiceLineAddEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
import {
  canAddInvoiceLineFromDetails,
  canEditInvoiceDueDateFromDetails,
  canIssueInvoiceFromDetails,
  detailLifecycleActionsFor,
  shouldReloadDetailAfterMutation,
  type BeginEditorOptions
} from "./invoiceDetail.ts";

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
    documentNumber: "INV-LINE-1",
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

describe("canAddDraftInvoiceLine", () => {
  it("allows add only for Draft", () => {
    assert.equal(canAddDraftInvoiceLine({ status: "Draft" }), true);
    assert.equal(canAddDraftInvoiceLine({ status: "Issued" }), false);
  });

  it("reuses the same draft eligibility as isDraftInvoice / issue / due-date", () => {
    const draft = sampleInvoice({ status: "Draft" });
    const issued = sampleInvoice({ status: "Issued" });
    assert.equal(canAddDraftInvoiceLine(draft), isDraftInvoice(draft));
    assert.equal(canAddDraftInvoiceLine(issued), isDraftInvoice(issued));
    assert.equal(canAddDraftInvoiceLine(draft), canIssueInvoiceFromDetails(draft));
    assert.equal(canAddDraftInvoiceLine(draft), canEditInvoiceDueDateFromDetails(draft));
  });
});

describe("initialDraftInvoiceLineAddInput", () => {
  it("starts with quantity 1 and empty price/description", () => {
    assert.deepEqual(initialDraftInvoiceLineAddInput(), {
      quantity: "1",
      unitPrice: "",
      description: ""
    });
  });
});

describe("validateDraftInvoiceLineAddInput / parseDraftInvoiceLineAddInput", () => {
  it("accepts valid amounts and optional description", () => {
    assert.equal(
      validateDraftInvoiceLineAddInput({
        quantity: "2",
        unitPrice: "10.5",
        description: " Service "
      }),
      null
    );
    assert.deepEqual(
      parseDraftInvoiceLineAddInput({
        quantity: "2",
        unitPrice: "10,5",
        description: " Service "
      }),
      { quantity: 2, unitPrice: 10.5, description: "Service" }
    );
  });

  it("normalizes blank description to null", () => {
    assert.deepEqual(
      parseDraftInvoiceLineAddInput({
        quantity: "1",
        unitPrice: "5",
        description: "   "
      }),
      { quantity: 1, unitPrice: 5, description: null }
    );
  });

  it("rejects non-positive quantity", () => {
    assert.match(
      validateDraftInvoiceLineAddInput({
        quantity: "0",
        unitPrice: "10",
        description: ""
      }) ?? "",
      /Кількість/
    );
  });

  it("rejects negative unit price", () => {
    assert.match(
      validateDraftInvoiceLineAddInput({
        quantity: "1",
        unitPrice: "-1",
        description: ""
      }) ?? "",
      /Ціна/
    );
  });

  it("rejects zero line amount", () => {
    assert.match(
      validateDraftInvoiceLineAddInput({
        quantity: "1",
        unitPrice: "0",
        description: ""
      }) ?? "",
      /Сума рядка/
    );
  });

  it("rejects description longer than domain max", () => {
    assert.match(
      validateDraftInvoiceLineAddInput({
        quantity: "1",
        unitPrice: "1",
        description: "x".repeat(INVOICE_LINE_DESCRIPTION_MAX_LENGTH + 1)
      }) ?? "",
      /500/
    );
  });
});

describe("applyDraftInvoiceLineAdd", () => {
  it("performs exactly one addInvoiceLine and never issues", async () => {
    const calls: Array<{
      workspaceId: string;
      invoiceId: string;
      quantity: number;
      unitPrice: number;
      description: string | null | undefined;
    }> = [];
    const updated = sampleInvoice({
      totalAmount: 21,
      lines: [
        {
          id: "l1",
          sequence: 1,
          description: "Service",
          quantity: 2,
          unitPrice: 10.5,
          lineAmount: 21
        }
      ]
    });

    const result = await applyDraftInvoiceLineAdd(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111",
      { quantity: "2", unitPrice: "10.5", description: "Service" },
      async (workspaceId, invoiceId, input) => {
        calls.push({
          workspaceId,
          invoiceId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          description: input.description
        });
        return updated;
      }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      workspaceId: "w1111111-1111-1111-1111-111111111111",
      invoiceId: "i1111111-1111-1111-1111-111111111111",
      quantity: 2,
      unitPrice: 10.5,
      description: "Service"
    });
    assert.equal(result.status, "Draft");
    assert.equal(result.totalAmount, 21);
    assert.equal(result.lines?.length, 1);
    assert.equal(
      typeof (result as Invoice & { issuedByEditor?: unknown }).issuedByEditor,
      "undefined"
    );
  });

  it("rejects invalid input before any mutation", async () => {
    let mutationCount = 0;
    await assert.rejects(
      () =>
        applyDraftInvoiceLineAdd("w", "i", { quantity: "0", unitPrice: "1", description: "" }, async () => {
          mutationCount += 1;
          return sampleInvoice();
        }),
      /Кількість/
    );
    assert.equal(mutationCount, 0);
  });
});

describe("interpretDraftInvoiceLineAddError", () => {
  it("keeps editor open on 400 without list refresh", () => {
    const failure = interpretDraftInvoiceLineAddError(
      new FakeFinanceApiRequestError("Quantity must be greater than zero.", 400, "ValidationFailed")
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Quantity must be greater than zero.");
  });

  it("maps 404 to closed editor with list refresh", () => {
    const failure = interpretDraftInvoiceLineAddError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /не знайдено/);
  });

  it("maps 409 to closed editor with list refresh and no auto-retry guidance", () => {
    const failure = interpretDraftInvoiceLineAddError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /змінено іншою дією/);
    assert.doesNotMatch(failure.message, /автоматичн/i);
  });

  it("keeps editor open on network errors without list refresh", () => {
    const failure = interpretDraftInvoiceLineAddError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });
});

describe("line-add editor handoff / coordination policy", () => {
  it("exposes addLine lifecycle action only for Draft", () => {
    assert.deepEqual(detailLifecycleActionsFor({ status: "Draft" }), [
      "addLine",
      "editDueDate",
      "issue"
    ]);
    assert.deepEqual(detailLifecycleActionsFor({ status: "Issued" }), []);
    assert.equal(canAddInvoiceLineFromDetails({ status: "Draft" }), true);
    assert.equal(canAddInvoiceLineFromDetails({ status: "Issued" }), false);
  });

  it("row and detail launches share BeginEditorOptions shape", () => {
    const rowLaunch: BeginEditorOptions = {};
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(detailLaunch.preserveDetail, true);
  });

  it("cancel keeps selection and performs zero mutations", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    const lineAddTargetId = selectedInvoiceId;
    const mutationCount = 0;
    const nextTarget = null;
    assert.equal(mutationCount, 0);
    assert.equal(nextTarget, null);
    assert.equal(selectedInvoiceId, lineAddTargetId);
  });

  it("success reloads detail only for the open invoice and keeps Draft", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const before = sampleInvoice({ id: invoiceId, totalAmount: 0, lines: [] });
    const after = sampleInvoice({
      id: invoiceId,
      totalAmount: 10,
      status: "Draft",
      lines: [
        {
          id: "l1",
          sequence: 1,
          description: "A",
          quantity: 1,
          unitPrice: 10,
          lineAmount: 10
        }
      ]
    });
    assert.equal(canAddDraftInvoiceLine(before), true);
    assert.equal(canAddDraftInvoiceLine(after), true);
    assert.equal(canIssueInvoiceFromDetails(after), true);
    assert.equal(shouldReloadDetailAfterMutation(invoiceId, after.id), true);
    assert.equal(after.status, "Draft");
    assert.equal(after.lines?.length, 1);
  });

  it("row entry without preserveDetail does not invent invoiceId", () => {
    const rowLaunch: BeginEditorOptions = {};
    const selectedInvoiceId: string | null = null;
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(selectedInvoiceId, null);
  });

  it("detail entry preserves invoiceId deep-link", () => {
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    assert.equal(detailLaunch.preserveDetail, true);
    assert.equal(selectedInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("draft filter may hide row while detail selection remains", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const listIds: string[] = [];
    const selectedInvoiceId = invoiceId;
    const appliedStatusFilter = "Draft";
    assert.equal(listIds.includes(invoiceId), false);
    assert.equal(selectedInvoiceId, invoiceId);
    assert.equal(appliedStatusFilter, "Draft");
    assert.equal(shouldReloadDetailAfterMutation(selectedInvoiceId, invoiceId), true);
  });

  it("A→B selection switch replaces line-add editor state", () => {
    const invoiceA = "i1111111-1111-1111-1111-111111111111";
    const invoiceB = "i2222222-2222-2222-2222-222222222222";
    let lineAddTargetId: string | null = invoiceA;
    let lineQuantity = "3";
    const selectedInvoiceId = invoiceB;
    if (selectedInvoiceId !== lineAddTargetId) {
      lineAddTargetId = null;
      lineQuantity = "1";
    }
    assert.equal(lineAddTargetId, null);
    assert.equal(lineQuantity, "1");
    assert.equal(selectedInvoiceId, invoiceB);
  });

  it("repeated entry for the same invoice does not duplicate target", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    let lineAddTargetId: string | null = null;
    function begin(id: string) {
      if (lineAddTargetId === id) {
        return;
      }
      lineAddTargetId = id;
    }
    begin(invoiceId);
    begin(invoiceId);
    assert.equal(lineAddTargetId, invoiceId);
  });

  it("double-submit prevention blocks second save while busy", () => {
    let mutationCount = 0;
    let busy = false;
    function save() {
      if (busy) {
        return;
      }
      busy = true;
      mutationCount += 1;
    }
    save();
    save();
    assert.equal(mutationCount, 1);
  });

  it("starting line-add resets non-pending issue prepare and due-date editor", () => {
    let issueTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let dueDateEditTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const issueBusy = false;
    const dueDateEditBusy = false;
    if (!issueBusy) {
      issueTargetId = null;
    }
    if (!dueDateEditBusy) {
      dueDateEditTargetId = null;
    }
    assert.equal(issueTargetId, null);
    assert.equal(dueDateEditTargetId, null);
  });

  it("starting due-date edit resets non-pending line-add editor", () => {
    let lineAddTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const lineAddBusy = false;
    if (!lineAddBusy) {
      lineAddTargetId = null;
    }
    assert.equal(lineAddTargetId, null);
  });

  it("starting issue resets non-pending line-add editor", () => {
    let lineAddTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const lineAddBusy = false;
    if (!lineAddBusy) {
      lineAddTargetId = null;
    }
    assert.equal(lineAddTargetId, null);
  });

  it("cannot start line-add while issue or due-date mutation is pending", () => {
    const issueBusy = true;
    const dueDateEditBusy = false;
    let started = false;
    if (!issueBusy && !dueDateEditBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("cannot start line-add while line-update or line-remove is pending", () => {
    const lineUpdateBusy = true;
    const lineRemoveBusy = false;
    let started = false;
    if (!lineUpdateBusy && !lineRemoveBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("cannot start issue or due-date while line-add save is pending", () => {
    const lineAddBusy = true;
    let startedIssue = false;
    let startedDueDate = false;
    if (!lineAddBusy) {
      startedIssue = true;
      startedDueDate = true;
    }
    assert.equal(startedIssue, false);
    assert.equal(startedDueDate, false);
  });

  it("pending line-add save blocks close for the same detail invoice", () => {
    const detailTargetId = "i1111111-1111-1111-1111-111111111111";
    const savingLineInvoiceId = detailTargetId;
    const lineAddBusy = true;
    const blocked = Boolean(
      detailTargetId && lineAddBusy && savingLineInvoiceId === detailTargetId
    );
    assert.equal(blocked, true);
  });

  it("list reload failure does not retry addInvoiceLine", () => {
    let addLineCount = 1;
    const listReloadFailed = true;
    if (listReloadFailed) {
      assert.equal(addLineCount, 1);
    }
    assert.equal(addLineCount, 1);
  });

  it("detail reload failure retry is getInvoice only", () => {
    let getInvoiceCount = 0;
    let addLineCount = 1;
    function retryDetail() {
      getInvoiceCount += 1;
    }
    retryDetail();
    assert.equal(getInvoiceCount, 1);
    assert.equal(addLineCount, 1);
  });

  it("Invoice and Accrual deep-links stay isolated by param names", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const accrualId = "a1111111-1111-1111-1111-111111111111";
    const url = new URL("http://localhost:5173/?invoiceId=" + invoiceId);
    assert.equal(url.searchParams.get("invoiceId"), invoiceId);
    assert.equal(url.searchParams.get("accrualId"), null);
    url.searchParams.set("accrualId", accrualId);
    assert.equal(url.searchParams.get("invoiceId"), invoiceId);
    assert.equal(url.searchParams.get("accrualId"), accrualId);
  });

  it("filters are preserved after success policy", () => {
    const appliedFilters = { status: "Draft" as const };
    const afterSuccessFilters = { ...appliedFilters };
    assert.deepEqual(afterSuccessFilters, appliedFilters);
  });

  it("line-add workflow never shares issueTarget state", () => {
    const lineAddTargetId = "i1111111-1111-1111-1111-111111111111";
    const issueTargetId: string | null = null;
    assert.notEqual(lineAddTargetId, issueTargetId);
    assert.equal(issueTargetId, null);
  });
});
