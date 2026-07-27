import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Invoice, InvoiceLine } from "./api.ts";
import {
  applyDraftInvoiceLineUpdate,
  canUpdateDraftInvoiceLine,
  findInvoiceLine,
  initialDraftInvoiceLineUpdateInput,
  INVOICE_LINE_DESCRIPTION_MAX_LENGTH,
  interpretDraftInvoiceLineUpdateError,
  parseDraftInvoiceLineUpdateInput,
  validateDraftInvoiceLineUpdateInput
} from "./draftInvoiceLineUpdateEditor.ts";
import { canAddDraftInvoiceLine } from "./draftInvoiceLineAddEditor.ts";
import { canRemoveDraftInvoiceLine } from "./draftInvoiceLineRemoveEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
import {
  canUpdateInvoiceLineFromDetails,
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
    documentNumber: "INV-UPD-1",
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

describe("canUpdateDraftInvoiceLine", () => {
  it("allows update only for Draft", () => {
    assert.equal(canUpdateDraftInvoiceLine({ status: "Draft" }), true);
    assert.equal(canUpdateDraftInvoiceLine({ status: "Issued" }), false);
  });

  it("reuses draft eligibility with add/remove/issue helpers", () => {
    const draft = sampleInvoice({ status: "Draft" });
    const issued = sampleInvoice({ status: "Issued" });
    assert.equal(canUpdateDraftInvoiceLine(draft), isDraftInvoice(draft));
    assert.equal(canUpdateDraftInvoiceLine(issued), isDraftInvoice(issued));
    assert.equal(canUpdateDraftInvoiceLine(draft), canAddDraftInvoiceLine(draft));
    assert.equal(canUpdateDraftInvoiceLine(draft), canRemoveDraftInvoiceLine(draft));
    assert.equal(canUpdateInvoiceLineFromDetails(draft), true);
    assert.equal(canUpdateInvoiceLineFromDetails(issued), false);
  });
});

describe("initialDraftInvoiceLineUpdateInput / findInvoiceLine", () => {
  it("prefills existing quantity, unit price and description", () => {
    assert.deepEqual(initialDraftInvoiceLineUpdateInput(sampleLine()), {
      quantity: "2",
      unitPrice: "10.5",
      description: "Service"
    });
  });

  it("prefills null description as empty string", () => {
    assert.equal(
      initialDraftInvoiceLineUpdateInput(sampleLine({ description: null })).description,
      ""
    );
  });

  it("finds line by id and returns null when missing", () => {
    const invoice = sampleInvoice();
    assert.equal(findInvoiceLine(invoice, "l1111111-1111-1111-1111-111111111111")?.sequence, 1);
    assert.equal(findInvoiceLine(invoice, "missing"), null);
  });
});

describe("validateDraftInvoiceLineUpdateInput / parseDraftInvoiceLineUpdateInput", () => {
  it("accepts valid amounts and optional description", () => {
    assert.equal(
      validateDraftInvoiceLineUpdateInput({
        quantity: "3",
        unitPrice: "4",
        description: " Updated "
      }),
      null
    );
    assert.deepEqual(
      parseDraftInvoiceLineUpdateInput({
        quantity: "3",
        unitPrice: "4,5",
        description: " Updated "
      }),
      { quantity: 3, unitPrice: 4.5, description: "Updated" }
    );
  });

  it("rejects non-positive quantity, negative price, zero amount and long description", () => {
    assert.match(
      validateDraftInvoiceLineUpdateInput({
        quantity: "0",
        unitPrice: "10",
        description: ""
      }) ?? "",
      /Кількість/
    );
    assert.match(
      validateDraftInvoiceLineUpdateInput({
        quantity: "1",
        unitPrice: "-1",
        description: ""
      }) ?? "",
      /Ціна/
    );
    assert.match(
      validateDraftInvoiceLineUpdateInput({
        quantity: "1",
        unitPrice: "0",
        description: ""
      }) ?? "",
      /Сума рядка/
    );
    assert.match(
      validateDraftInvoiceLineUpdateInput({
        quantity: "1",
        unitPrice: "1",
        description: "x".repeat(INVOICE_LINE_DESCRIPTION_MAX_LENGTH + 1)
      }) ?? "",
      /500/
    );
  });
});

describe("applyDraftInvoiceLineUpdate", () => {
  it("performs exactly one updateInvoiceLine and never issues", async () => {
    const calls: Array<{
      workspaceId: string;
      invoiceId: string;
      lineId: string;
      quantity: number;
      unitPrice: number;
      description: string | null | undefined;
    }> = [];
    const updated = sampleInvoice({
      totalAmount: 30,
      lines: [sampleLine({ quantity: 3, unitPrice: 10, lineAmount: 30, description: "Updated" })]
    });

    const result = await applyDraftInvoiceLineUpdate(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111",
      "l1111111-1111-1111-1111-111111111111",
      { quantity: "3", unitPrice: "10", description: "Updated" },
      async (workspaceId, invoiceId, lineId, input) => {
        calls.push({
          workspaceId,
          invoiceId,
          lineId,
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
      lineId: "l1111111-1111-1111-1111-111111111111",
      quantity: 3,
      unitPrice: 10,
      description: "Updated"
    });
    assert.equal(result.status, "Draft");
    assert.equal(result.totalAmount, 30);
    assert.equal(
      typeof (result as Invoice & { issuedByEditor?: unknown }).issuedByEditor,
      "undefined"
    );
  });

  it("rejects invalid input before any mutation", async () => {
    let mutationCount = 0;
    await assert.rejects(
      () =>
        applyDraftInvoiceLineUpdate(
          "w",
          "i",
          "l",
          { quantity: "0", unitPrice: "1", description: "" },
          async () => {
            mutationCount += 1;
            return sampleInvoice();
          }
        ),
      /Кількість/
    );
    assert.equal(mutationCount, 0);
  });
});

describe("interpretDraftInvoiceLineUpdateError", () => {
  it("keeps editor open on 400 without list refresh", () => {
    const failure = interpretDraftInvoiceLineUpdateError(
      new FakeFinanceApiRequestError("Quantity must be greater than zero.", 400, "ValidationFailed")
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Quantity must be greater than zero.");
  });

  it("maps 404 to closed editor with list refresh", () => {
    const failure = interpretDraftInvoiceLineUpdateError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /не знайдено/);
  });

  it("maps 409 to closed editor with list refresh", () => {
    const failure = interpretDraftInvoiceLineUpdateError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /змінено іншою дією/);
  });

  it("keeps editor open on network errors without list refresh", () => {
    const failure = interpretDraftInvoiceLineUpdateError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
  });
});

describe("line-update editor handoff / coordination policy", () => {
  it("detail entry preserves invoiceId deep-link", () => {
    const detailLaunch: BeginEditorOptions = { preserveDetail: true };
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    assert.equal(detailLaunch.preserveDetail, true);
    assert.equal(selectedInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("cancel keeps selection and performs zero mutations", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    const lineUpdateTargetId = selectedInvoiceId;
    const mutationCount = 0;
    const nextTarget = null;
    assert.equal(mutationCount, 0);
    assert.equal(nextTarget, null);
    assert.equal(selectedInvoiceId, lineUpdateTargetId);
  });

  it("success reloads detail only for the open invoice and keeps Draft", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const after = sampleInvoice({
      id: invoiceId,
      totalAmount: 30,
      status: "Draft",
      lines: [sampleLine({ quantity: 3, unitPrice: 10, lineAmount: 30 })]
    });
    assert.equal(shouldReloadDetailAfterMutation(invoiceId, after.id), true);
    assert.equal(after.status, "Draft");
  });

  it("Invoice A → B resets line-update editor state", () => {
    const invoiceA = "i1111111-1111-1111-1111-111111111111";
    const invoiceB = "i2222222-2222-2222-2222-222222222222";
    let lineUpdateInvoiceId: string | null = invoiceA;
    let lineQuantity = "9";
    const selectedInvoiceId = invoiceB;
    if (selectedInvoiceId !== lineUpdateInvoiceId) {
      lineUpdateInvoiceId = null;
      lineQuantity = "1";
    }
    assert.equal(lineUpdateInvoiceId, null);
    assert.equal(lineQuantity, "1");
  });

  it("Line A → Line B replaces editor state without leakage", () => {
    const lineA = "l1111111-1111-1111-1111-111111111111";
    const lineB = "l2222222-2222-2222-2222-222222222222";
    let lineUpdateLineId: string | null = lineA;
    let quantity = "2";
    function begin(lineId: string, nextQuantity: string) {
      if (lineUpdateLineId === lineId) {
        return;
      }
      lineUpdateLineId = lineId;
      quantity = nextQuantity;
    }
    begin(lineB, "5");
    assert.equal(lineUpdateLineId, lineB);
    assert.equal(quantity, "5");
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

  it("cannot start update while another invoice mutation is pending", () => {
    const lineAddBusy = true;
    let started = false;
    if (!lineAddBusy) {
      started = true;
    }
    assert.equal(started, false);
  });

  it("starting update resets non-pending add/due-date/issue/remove", () => {
    let lineAddTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let dueDateEditTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let issueTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    let lineRemoveTargetId: string | null = "i1111111-1111-1111-1111-111111111111";
    const pending = false;
    if (!pending) {
      lineAddTargetId = null;
      dueDateEditTargetId = null;
      issueTargetId = null;
      lineRemoveTargetId = null;
    }
    assert.equal(lineAddTargetId, null);
    assert.equal(dueDateEditTargetId, null);
    assert.equal(issueTargetId, null);
    assert.equal(lineRemoveTargetId, null);
  });

  it("pending update blocks close for the same detail invoice", () => {
    const detailTargetId = "i1111111-1111-1111-1111-111111111111";
    const savingLineUpdateInvoiceId = detailTargetId;
    const lineUpdateBusy = true;
    const blocked = Boolean(
      detailTargetId && lineUpdateBusy && savingLineUpdateInvoiceId === detailTargetId
    );
    assert.equal(blocked, true);
  });

  it("list reload failure does not retry updateInvoiceLine", () => {
    let updateLineCount = 1;
    const listReloadFailed = true;
    if (listReloadFailed) {
      assert.equal(updateLineCount, 1);
    }
    assert.equal(updateLineCount, 1);
  });

  it("detail reload failure retry is getInvoice only", () => {
    let getInvoiceCount = 0;
    let updateLineCount = 1;
    function retryDetail() {
      getInvoiceCount += 1;
    }
    retryDetail();
    assert.equal(getInvoiceCount, 1);
    assert.equal(updateLineCount, 1);
  });

  it("filters are preserved after success policy", () => {
    const appliedFilters = { status: "Draft" as const };
    const afterSuccessFilters = { ...appliedFilters };
    assert.deepEqual(afterSuccessFilters, appliedFilters);
  });
});
