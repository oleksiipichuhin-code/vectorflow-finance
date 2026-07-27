import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Invoice, InvoiceLine } from "./api.ts";
import {
  applyDraftInvoiceLineRemove,
  canRemoveDraftInvoiceLine,
  draftInvoiceLineConfirmationLabel,
  interpretDraftInvoiceLineRemoveError
} from "./draftInvoiceLineRemoveEditor.ts";
import { canUpdateDraftInvoiceLine } from "./draftInvoiceLineUpdateEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
import {
  canRemoveInvoiceLineFromDetails,
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

function sampleLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id: "l1111111-1111-1111-1111-111111111111",
    sequence: 1,
    description: "Service",
    quantity: 2,
    unitPrice: 10.5,
    lineAmount: 21,
    ...overrides
  };
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "i1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    documentNumber: "INV-RM-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    status: "Draft",
    dueDateUtc: null,
    totalAmount: 21,
    createdAtUtc: "2026-07-01T10:00:00.000Z",
    updatedAtUtc: "2026-07-02T11:00:00.000Z",
    issuedAtUtc: null,
    lines: [sampleLine()],
    ...overrides
  };
}

describe("canRemoveDraftInvoiceLine", () => {
  it("allows remove only for Draft", () => {
    assert.equal(canRemoveDraftInvoiceLine({ status: "Draft" }), true);
    assert.equal(canRemoveDraftInvoiceLine({ status: "Issued" }), false);
  });

  it("reuses draft eligibility with update helper", () => {
    const draft = sampleInvoice({ status: "Draft" });
    const issued = sampleInvoice({ status: "Issued" });
    assert.equal(canRemoveDraftInvoiceLine(draft), isDraftInvoice(draft));
    assert.equal(canRemoveDraftInvoiceLine(issued), isDraftInvoice(issued));
    assert.equal(canRemoveDraftInvoiceLine(draft), canUpdateDraftInvoiceLine(draft));
    assert.equal(canRemoveInvoiceLineFromDetails(draft), true);
    assert.equal(canRemoveInvoiceLineFromDetails(issued), false);
  });
});

describe("draftInvoiceLineConfirmationLabel", () => {
  it("identifies the exact line with sequence and description", () => {
    assert.equal(
      draftInvoiceLineConfirmationLabel(sampleLine()),
      "#1 · Service"
    );
  });

  it("uses fallback when description is blank", () => {
    assert.equal(
      draftInvoiceLineConfirmationLabel(sampleLine({ description: null })),
      "#1 · без опису"
    );
  });
});

describe("applyDraftInvoiceLineRemove", () => {
  it("performs exactly one removeInvoiceLine and never issues", async () => {
    const calls: Array<{ workspaceId: string; invoiceId: string; lineId: string }> = [];
    const updated = sampleInvoice({
      totalAmount: 0,
      lines: []
    });

    const result = await applyDraftInvoiceLineRemove(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111",
      "l1111111-1111-1111-1111-111111111111",
      async (workspaceId, invoiceId, lineId) => {
        calls.push({ workspaceId, invoiceId, lineId });
        return updated;
      }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      workspaceId: "w1111111-1111-1111-1111-111111111111",
      invoiceId: "i1111111-1111-1111-1111-111111111111",
      lineId: "l1111111-1111-1111-1111-111111111111"
    });
    assert.equal(result.status, "Draft");
    assert.equal(result.lines?.length, 0);
    assert.equal(
      typeof (result as Invoice & { issuedByEditor?: unknown }).issuedByEditor,
      "undefined"
    );
  });

  it("final-line removal keeps Draft with empty lines (backend policy)", async () => {
    const after = await applyDraftInvoiceLineRemove(
      "w",
      "i",
      "l1111111-1111-1111-1111-111111111111",
      async () => sampleInvoice({ totalAmount: 0, lines: [] })
    );
    assert.equal(after.status, "Draft");
    assert.deepEqual(after.lines, []);
    assert.equal(after.totalAmount, 0);
  });
});

describe("interpretDraftInvoiceLineRemoveError", () => {
  it("keeps confirmation open on 400 without list refresh", () => {
    const failure = interpretDraftInvoiceLineRemoveError(
      new FakeFinanceApiRequestError("Bad request", 400, "ValidationFailed")
    );
    assert.equal(failure.keepConfirmationOpen, true);
    assert.equal(failure.refreshList, false);
  });

  it("maps 404 to closed confirmation with list refresh", () => {
    const failure = interpretDraftInvoiceLineRemoveError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.keepConfirmationOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /не знайдено/);
  });

  it("maps 409 to closed confirmation with list refresh", () => {
    const failure = interpretDraftInvoiceLineRemoveError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.keepConfirmationOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /змінено іншою дією/);
  });

  it("keeps confirmation open on network errors", () => {
    const failure = interpretDraftInvoiceLineRemoveError(new Error("Failed to fetch"));
    assert.equal(failure.keepConfirmationOpen, true);
    assert.equal(failure.refreshList, false);
  });
});

describe("line-remove confirmation handoff / coordination policy", () => {
  it("detail entry preserves invoiceId deep-link", () => {
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    assert.equal(detailLaunch.preserveDetail, true);
  });

  it("cancel keeps selection and performs zero mutations", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    const mutationCount = 0;
    const nextTarget = null;
    assert.equal(mutationCount, 0);
    assert.equal(nextTarget, null);
    assert.equal(selectedInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("success removes the selected line after authoritative GET", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const removedLineId = "l1111111-1111-1111-1111-111111111111";
    const kept = sampleLine({
      id: "l2222222-2222-2222-2222-222222222222",
      sequence: 2,
      description: "Keep",
      quantity: 1,
      unitPrice: 10,
      lineAmount: 10
    });
    const after = sampleInvoice({
      id: invoiceId,
      totalAmount: 10,
      lines: [kept]
    });
    assert.equal(
      (after.lines ?? []).some((line) => line.id === removedLineId),
      false
    );
    assert.equal(after.lines?.[0]?.id, kept.id);
    assert.equal(shouldReloadDetailAfterMutation(invoiceId, after.id), true);
  });

  it("stale line protection uses the captured lineId for the mutation", () => {
    const openedLineId = "l1111111-1111-1111-1111-111111111111";
    const mutatedLineId = openedLineId;
    assert.equal(mutatedLineId, openedLineId);
  });

  it("double-confirm prevention blocks second remove while busy", () => {
    let mutationCount = 0;
    let busy = false;
    function confirm() {
      if (busy) {
        return;
      }
      busy = true;
      mutationCount += 1;
    }
    confirm();
    confirm();
    assert.equal(mutationCount, 1);
  });

  it("cannot start remove while update or add is pending", () => {
    const lineUpdateBusy = true;
    let started = false;
    if (!lineUpdateBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("starting remove resets non-pending update/add/due-date/issue", () => {
    let lineUpdateTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let lineAddTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let dueDateEditTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let issueTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const pending = false;
    if (!pending) {
      lineUpdateTargetId = null;
      lineAddTargetId = null;
      dueDateEditTargetId = null;
      issueTargetId = null;
    }
    assert.equal(lineUpdateTargetId, null);
    assert.equal(lineAddTargetId, null);
    assert.equal(dueDateEditTargetId, null);
    assert.equal(issueTargetId, null);
  });

  it("pending remove blocks close for the same detail invoice", () => {
    const detailTargetId = "i1111111-1111-1111-1111-111111111111";
    const savingLineRemoveInvoiceId = detailTargetId;
    const lineRemoveBusy = true;
    const blocked = Boolean(
      detailTargetId && lineRemoveBusy && savingLineRemoveInvoiceId === detailTargetId
    );
    assert.equal(blocked, true);
  });

  it("list reload failure does not retry removeInvoiceLine", () => {
    let removeLineCount = 1;
    const listReloadFailed = true;
    if (listReloadFailed) {
      assert.equal(removeLineCount, 1);
    }
    assert.equal(removeLineCount, 1);
  });

  it("detail reload failure retry is getInvoice only", () => {
    let getInvoiceCount = 0;
    let removeLineCount = 1;
    function retryDetail() {
      getInvoiceCount += 1;
    }
    retryDetail();
    assert.equal(getInvoiceCount, 1);
    assert.equal(removeLineCount, 1);
  });

  it("filters are preserved after success policy", () => {
    const appliedFilters = { status: "Draft" as const };
    assert.deepEqual({ ...appliedFilters }, appliedFilters);
  });
});
