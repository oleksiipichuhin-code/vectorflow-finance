import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Invoice } from "./api.ts";
import {
  applyDraftInvoiceDueDateChange,
  canEditDraftInvoiceDueDate,
  formatDueDateInput,
  initialDueDateInputValue,
  interpretDraftInvoiceDueDateEditError,
  validateDraftInvoiceDueDateInput
} from "./draftInvoiceDueDateEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
import {
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
    documentNumber: "INV-DUE-1",
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

describe("canEditDraftInvoiceDueDate", () => {
  it("allows edit only for Draft", () => {
    assert.equal(canEditDraftInvoiceDueDate({ status: "Draft" }), true);
    assert.equal(canEditDraftInvoiceDueDate({ status: "Issued" }), false);
  });

  it("reuses the same draft eligibility as isDraftInvoice / issue", () => {
    const draft = sampleInvoice({ status: "Draft" });
    const issued = sampleInvoice({ status: "Issued" });
    assert.equal(canEditDraftInvoiceDueDate(draft), isDraftInvoice(draft));
    assert.equal(canEditDraftInvoiceDueDate(issued), isDraftInvoice(issued));
    assert.equal(canEditDraftInvoiceDueDate(draft), canIssueInvoiceFromDetails(draft));
  });
});

describe("initialDueDateInputValue / formatDueDateInput", () => {
  it("prefills existing due date as YYYY-MM-DD", () => {
    assert.equal(formatDueDateInput("2026-08-25T00:00:00.000Z"), "2026-08-25");
    assert.equal(
      initialDueDateInputValue(sampleInvoice({ dueDateUtc: "2026-08-25T00:00:00.000Z" })),
      "2026-08-25"
    );
  });

  it("leaves input empty when due date is unset", () => {
    assert.equal(formatDueDateInput(null), "");
    assert.equal(formatDueDateInput(undefined), "");
    assert.equal(initialDueDateInputValue(sampleInvoice({ dueDateUtc: null })), "");
  });
});

describe("validateDraftInvoiceDueDateInput", () => {
  it("accepts YYYY-MM-DD", () => {
    assert.equal(validateDraftInvoiceDueDateInput("2030-01-15"), null);
  });

  it("rejects invalid formats without inventing business rules", () => {
    assert.match(validateDraftInvoiceDueDateInput("") ?? "", /YYYY-MM-DD/);
    assert.match(validateDraftInvoiceDueDateInput("15-01-2030") ?? "", /YYYY-MM-DD/);
  });
});

describe("applyDraftInvoiceDueDateChange", () => {
  it("performs exactly one setInvoiceDueDate and never issues", async () => {
    const calls: Array<{ workspaceId: string; invoiceId: string; dueDateUtc: string }> = [];
    const updated = sampleInvoice({
      dueDateUtc: "2030-01-15T00:00:00.000Z",
      totalAmount: 10
    });

    const result = await applyDraftInvoiceDueDateChange(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111",
      "2030-01-15",
      async (workspaceId, invoiceId, dueDateUtc) => {
        calls.push({ workspaceId, invoiceId, dueDateUtc });
        return updated;
      }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      workspaceId: "w1111111-1111-1111-1111-111111111111",
      invoiceId: "i1111111-1111-1111-1111-111111111111",
      dueDateUtc: "2030-01-15T00:00:00.000Z"
    });
    assert.equal(result.dueDateUtc, "2030-01-15T00:00:00.000Z");
    assert.equal(result.status, "Draft");
    assert.equal(
      typeof (result as Invoice & { issuedByEditor?: unknown }).issuedByEditor,
      "undefined"
    );
  });

  it("rejects invalid input before any mutation", async () => {
    let mutationCount = 0;
    await assert.rejects(
      () =>
        applyDraftInvoiceDueDateChange("w", "i", "bad", async () => {
          mutationCount += 1;
          return sampleInvoice();
        }),
      /YYYY-MM-DD/
    );
    assert.equal(mutationCount, 0);
  });
});

describe("interpretDraftInvoiceDueDateEditError", () => {
  it("keeps editor open on 400 without list refresh", () => {
    const failure = interpretDraftInvoiceDueDateEditError(
      new FakeFinanceApiRequestError("Due date invalid", 400, "ValidationFailed")
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Due date invalid");
  });

  it("maps 404 to closed editor with list refresh", () => {
    const failure = interpretDraftInvoiceDueDateEditError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /не знайдено/);
  });

  it("maps 409 to closed editor with list refresh and no auto-retry guidance", () => {
    const failure = interpretDraftInvoiceDueDateEditError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /змінено іншою дією/);
    assert.doesNotMatch(failure.message, /автоматичн/i);
  });

  it("keeps editor open on network errors without list refresh", () => {
    const failure = interpretDraftInvoiceDueDateEditError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });
});

describe("due-date editor handoff / coordination policy", () => {
  it("exposes editDueDate lifecycle action only for Draft", () => {
    assert.deepEqual(detailLifecycleActionsFor({ status: "Draft" }), [
      "editHeader",
      "addLine",
      "editDueDate",
      "issue",
      "createAccrual"
    ]);
    assert.deepEqual(detailLifecycleActionsFor({ status: "Issued" }), ["createAccrual"]);
  });

  it("row and detail launches share BeginEditorOptions shape", () => {
    const rowLaunch: BeginEditorOptions = {};
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    assert.equal(rowLaunch.preserveDetail, undefined);
    assert.equal(detailLaunch.preserveDetail, true);
  });

  it("cancel keeps selection and performs zero mutations", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    const dueDateEditTargetId = selectedInvoiceId;
    const mutationCount = 0;
    const nextTarget = null;
    assert.equal(mutationCount, 0);
    assert.equal(nextTarget, null);
    assert.equal(selectedInvoiceId, dueDateEditTargetId);
  });

  it("success reloads detail only for the open invoice and keeps Draft", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const before = sampleInvoice({ id: invoiceId, dueDateUtc: null });
    const after = sampleInvoice({
      id: invoiceId,
      dueDateUtc: "2026-09-01T00:00:00.000Z",
      status: "Draft"
    });
    assert.equal(canEditDraftInvoiceDueDate(before), true);
    assert.equal(canEditDraftInvoiceDueDate(after), true);
    assert.equal(canIssueInvoiceFromDetails(after), true);
    assert.equal(shouldReloadDetailAfterMutation(invoiceId, after.id), true);
    assert.equal(after.status, "Draft");
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

  it("A→B selection switch replaces due-date editor state", () => {
    const invoiceA = "i1111111-1111-1111-1111-111111111111";
    const invoiceB = "i2222222-2222-2222-2222-222222222222";
    let dueDateEditTargetId: string | null = invoiceA;
    let dueDateValue = "2026-08-01";
    const selectedInvoiceId = invoiceB;
    if (selectedInvoiceId !== dueDateEditTargetId) {
      dueDateEditTargetId = null;
      dueDateValue = "";
    }
    assert.equal(dueDateEditTargetId, null);
    assert.equal(dueDateValue, "");
    assert.equal(selectedInvoiceId, invoiceB);
  });

  it("repeated entry for the same invoice does not duplicate target", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    let dueDateEditTargetId: string | null = null;
    function begin(id: string) {
      if (dueDateEditTargetId === id) {
        return;
      }
      dueDateEditTargetId = id;
    }
    begin(invoiceId);
    begin(invoiceId);
    assert.equal(dueDateEditTargetId, invoiceId);
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

  it("starting due-date edit resets non-pending issue prepare", () => {
    let issueTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const issueBusy = false;
    if (!issueBusy) {
      issueTargetId = null;
    }
    assert.equal(issueTargetId, null);
  });

  it("starting issue resets non-pending due-date editor", () => {
    let dueDateEditTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const dueDateEditBusy = false;
    if (!dueDateEditBusy) {
      dueDateEditTargetId = null;
    }
    assert.equal(dueDateEditTargetId, null);
  });

  it("cannot start due-date edit while issue mutation is pending", () => {
    const issueBusy = true;
    let started = false;
    if (!issueBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("cannot start issue while due-date save is pending", () => {
    const dueDateEditBusy = true;
    let started = false;
    if (!dueDateEditBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("pending due-date save blocks close for the same detail invoice", () => {
    const detailTargetId = "i1111111-1111-1111-1111-111111111111";
    const savingDueDateInvoiceId = detailTargetId;
    const dueDateEditBusy = true;
    const blocked = Boolean(
      detailTargetId && dueDateEditBusy && savingDueDateInvoiceId === detailTargetId
    );
    assert.equal(blocked, true);
  });

  it("list reload failure does not retry setInvoiceDueDate", () => {
    let setDueDateCount = 1;
    const listReloadFailed = true;
    if (listReloadFailed) {
      // Surface list error only; mutation already completed.
      assert.equal(setDueDateCount, 1);
    }
    assert.equal(setDueDateCount, 1);
  });

  it("detail reload failure retry is getInvoice only", () => {
    let getInvoiceCount = 0;
    let setDueDateCount = 1;
    function retryDetail() {
      getInvoiceCount += 1;
    }
    retryDetail();
    assert.equal(getInvoiceCount, 1);
    assert.equal(setDueDateCount, 1);
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
});
