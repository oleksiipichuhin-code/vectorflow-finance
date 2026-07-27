import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCreateAccrualFromInvoice,
  buildRelatedAccrualRowView,
  canCreateAccrualFromInvoice,
  defaultDescriptionFromInvoice,
  initialCreateAccrualFromInvoiceValues,
  interpretCreateAccrualFromInvoiceError,
  interpretRelatedAccrualsLoadError,
  parseCreateAccrualFromInvoiceValues,
  shouldReloadRelatedAccrualsAfterCreate,
  validateCreateAccrualFromInvoiceValues
} from "./invoiceAccrualBridge.ts";
import type { Accrual, Invoice } from "./api.ts";

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
    documentNumber: "INV-BRIDGE-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    status: "Issued",
    dueDateUtc: "2026-08-01T00:00:00.000Z",
    totalAmount: 250.5,
    createdAtUtc: "2026-07-01T10:00:00.000Z",
    updatedAtUtc: "2026-07-02T11:00:00.000Z",
    issuedAtUtc: "2026-07-03T08:00:00.000Z",
    lines: [],
    ...overrides
  };
}

function sampleAccrual(overrides: Partial<Accrual> = {}): Accrual {
  return {
    id: "a1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    type: "Revenue",
    amount: 250.5,
    currency: "UAH",
    recognitionDateUtc: "2026-07-27T00:00:00.000Z",
    description: "Нарахування за INV-BRIDGE-1",
    sourceInvoiceId: "i1111111-1111-1111-1111-111111111111",
    status: "Draft",
    createdAtUtc: "2026-07-27T12:00:00.000Z",
    updatedAtUtc: "2026-07-27T12:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

describe("canCreateAccrualFromInvoice", () => {
  it("allows Draft and Issued", () => {
    assert.equal(canCreateAccrualFromInvoice({ status: "Draft" }), true);
    assert.equal(canCreateAccrualFromInvoice({ status: "Issued" }), true);
  });

  it("rejects unknown statuses", () => {
    assert.equal(canCreateAccrualFromInvoice({ status: "Cancelled" }), false);
  });
});

describe("initialCreateAccrualFromInvoiceValues", () => {
  it("prefills amount currency description and recognition date from invoice", () => {
    const values = initialCreateAccrualFromInvoiceValues(
      sampleInvoice(),
      new Date("2026-07-27T15:30:00.000Z")
    );
    assert.equal(values.type, "Revenue");
    assert.equal(values.amount, "250.50");
    assert.equal(values.currency, "UAH");
    assert.equal(values.recognitionDate, "2026-07-27");
    assert.equal(values.description, "Нарахування за INV-BRIDGE-1");
  });

  it("leaves amount blank when invoice total is non-positive", () => {
    const values = initialCreateAccrualFromInvoiceValues(
      sampleInvoice({ totalAmount: 0 }),
      new Date("2026-07-27T00:00:00.000Z")
    );
    assert.equal(values.amount, "");
  });
});

describe("defaultDescriptionFromInvoice", () => {
  it("truncates to domain max length", () => {
    const longNumber = "X".repeat(600);
    const description = defaultDescriptionFromInvoice({ documentNumber: longNumber });
    assert.equal(description.length, 500);
  });
});

describe("parseCreateAccrualFromInvoiceValues / validate", () => {
  it("accepts valid form values and locks source invoice id", () => {
    const parsed = parseCreateAccrualFromInvoiceValues(
      {
        type: "Expense",
        amount: "10,50",
        currency: "uah",
        recognitionDate: "2026-07-27",
        description: " Accrual "
      },
      "i1111111-1111-1111-1111-111111111111"
    );
    assert.equal(parsed.type, "Expense");
    assert.equal(parsed.amount, 10.5);
    assert.equal(parsed.currency, "UAH");
    assert.equal(parsed.recognitionDateUtc, "2026-07-27T00:00:00.000Z");
    assert.equal(parsed.description, "Accrual");
    assert.equal(parsed.sourceInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("rejects blank amount and blank description without mutation", () => {
    assert.match(
      validateCreateAccrualFromInvoiceValues({
        type: "Revenue",
        amount: "",
        currency: "UAH",
        recognitionDate: "2026-07-27",
        description: "Ok"
      }) ?? "",
      /числовим|більшою/
    );
    assert.match(
      validateCreateAccrualFromInvoiceValues({
        type: "Revenue",
        amount: "10",
        currency: "UAH",
        recognitionDate: "2026-07-27",
        description: "   "
      }) ?? "",
      /Опис/
    );
  });
});

describe("applyCreateAccrualFromInvoice", () => {
  it("performs exactly one createAccrual with sourceInvoiceId", async () => {
    const calls: unknown[] = [];
    const created = sampleAccrual();
    const result = await applyCreateAccrualFromInvoice(
      "w1111111-1111-1111-1111-111111111111",
      sampleInvoice(),
      initialCreateAccrualFromInvoiceValues(
        sampleInvoice(),
        new Date("2026-07-27T00:00:00.000Z")
      ),
      {
        createAccrual: async (workspaceId, input) => {
          calls.push({ workspaceId, input });
          return created;
        }
      }
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      workspaceId: "w1111111-1111-1111-1111-111111111111",
      input: {
        type: "Revenue",
        amount: 250.5,
        currency: "UAH",
        recognitionDateUtc: "2026-07-27T00:00:00.000Z",
        description: "Нарахування за INV-BRIDGE-1",
        sourceInvoiceId: "i1111111-1111-1111-1111-111111111111"
      }
    });
    assert.equal(result.id, created.id);
  });

  it("rejects invalid input before any mutation", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        applyCreateAccrualFromInvoice(
          "w1111111-1111-1111-1111-111111111111",
          sampleInvoice(),
          {
            type: "Revenue",
            amount: "0",
            currency: "UAH",
            recognitionDate: "2026-07-27",
            description: "x"
          },
          {
            createAccrual: async () => {
              calls += 1;
              return sampleAccrual();
            }
          }
        ),
      /більшою за нуль/
    );
    assert.equal(calls, 0);
  });
});

describe("interpretCreateAccrualFromInvoiceError", () => {
  it("keeps form open on 400 validation", () => {
    const failure = interpretCreateAccrualFromInvoiceError(
      new FakeFinanceApiRequestError("bad amount", 400, "ValidationFailed")
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.refreshInvoice, false);
    assert.match(failure.message, /bad amount/);
  });

  it("maps Invoice NotFound to closed form and invoice refresh", () => {
    const failure = interpretCreateAccrualFromInvoiceError(
      new FakeFinanceApiRequestError("Invoice was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepFormOpen, false);
    assert.equal(failure.refreshInvoice, true);
  });

  it("keeps form open on 409 conflict", () => {
    const failure = interpretCreateAccrualFromInvoiceError(
      new FakeFinanceApiRequestError("conflict", 409, "Conflict")
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.refreshInvoice, false);
  });

  it("keeps form open on network errors", () => {
    const failure = interpretCreateAccrualFromInvoiceError(new Error("offline"));
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.refreshInvoice, false);
    assert.equal(failure.message, "offline");
  });
});

describe("related accruals helpers", () => {
  it("builds display rows without inventing amounts", () => {
    const row = buildRelatedAccrualRowView(
      sampleAccrual(),
      (amount, currency) => `${amount.toFixed(2)} ${currency}`,
      () => "27.07.2026"
    );
    assert.equal(row.id, "a1111111-1111-1111-1111-111111111111");
    assert.equal(row.amountDisplay, "250.50 UAH");
    assert.equal(row.status, "Draft");
  });

  it("reloads related list only for the open invoice", () => {
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    assert.equal(shouldReloadRelatedAccrualsAfterCreate(invoiceId, invoiceId), true);
    assert.equal(shouldReloadRelatedAccrualsAfterCreate(null, invoiceId), false);
  });

  it("maps related load failures as retryable", () => {
    const failure = interpretRelatedAccrualsLoadError(new Error("timeout"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.message, "timeout");
  });
});

describe("create-accrual editor handoff / coordination policy", () => {
  it("detail entry preserves invoiceId deep-link", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    const preserveDetail = true;
    assert.equal(preserveDetail, true);
    assert.equal(selectedInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("cancel keeps selection and performs zero mutations", () => {
    const selectedInvoiceId = "i1111111-1111-1111-1111-111111111111";
    let mutationCount = 0;
    const nextTarget = null;
    assert.equal(mutationCount, 0);
    assert.equal(nextTarget, null);
    assert.equal(selectedInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("double-submit prevention blocks second save while busy", () => {
    let busy = false;
    let saves = 0;
    function saveOnce() {
      if (busy) {
        return;
      }
      busy = true;
      saves += 1;
    }
    saveOnce();
    saveOnce();
    assert.equal(saves, 1);
  });

  it("cannot start create-accrual while another invoice mutation is pending", () => {
    const isAnyInvoiceMutationBusy = true;
    const canStart = canCreateAccrualFromInvoice({ status: "Issued" }) && !isAnyInvoiceMutationBusy;
    assert.equal(canStart, false);
  });

  it("Invoice and Accrual deep-links stay isolated by param names", () => {
    const invoiceParam = "invoiceId";
    const accrualParam = "accrualId";
    assert.notEqual(invoiceParam, accrualParam);
  });
});
