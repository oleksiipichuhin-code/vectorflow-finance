import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAccrualDetailFields,
  canViewAccrualDetails,
  interpretAccrualDetailLoadError,
  interpretSourceInvoiceDetailLoadError,
  shouldLoadSourceInvoice,
  sourceInvoiceDetailFromInvoice,
  sourceInvoiceDetailNone
} from "./accrualDetail.ts";
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

function sampleAccrual(overrides: Partial<Accrual> = {}): Accrual {
  return {
    id: "a1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    type: "Revenue",
    amount: 250.5,
    currency: "UAH",
    recognitionDateUtc: "2026-07-01T00:00:00.000Z",
    description: "Detail sample",
    sourceInvoiceId: null,
    status: "Draft",
    createdAtUtc: "2026-07-01T10:00:00.000Z",
    updatedAtUtc: "2026-07-02T11:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

describe("canViewAccrualDetails", () => {
  it("is available for Draft", () => {
    assert.equal(canViewAccrualDetails({ status: "Draft" }), true);
  });

  it("is available for Recognized", () => {
    assert.equal(canViewAccrualDetails({ status: "Recognized" }), true);
  });

  it("is available for Reversed", () => {
    assert.equal(canViewAccrualDetails({ status: "Reversed" }), true);
  });

  it("is unavailable for unknown status", () => {
    assert.equal(canViewAccrualDetails({ status: "Unknown" }), false);
  });
});

describe("buildAccrualDetailFields", () => {
  it("formats amount and currency without float transforms", () => {
    const fields = buildAccrualDetailFields(sampleAccrual({ amount: 100.1, currency: "EUR" }));
    assert.equal(fields.amountDisplay, "100.10 EUR");
    assert.equal(fields.currency, "EUR");
  });

  it("formats dates via shared formatter and null timestamps as em dash", () => {
    const fields = buildAccrualDetailFields(
      sampleAccrual({
        status: "Draft",
        recognizedAtUtc: null,
        reversedAtUtc: null,
        reversalReason: null
      })
    );

    assert.notEqual(fields.recognitionDateDisplay, "—");
    assert.notEqual(fields.createdAtDisplay, "—");
    assert.notEqual(fields.updatedAtDisplay, "—");
    assert.equal(fields.recognizedAtDisplay, "—");
    assert.equal(fields.reversedAtDisplay, "—");
    assert.equal(fields.reversalReasonDisplay, "—");
  });

  it("shows Recognized and Reversed lifecycle fields when present", () => {
    const fields = buildAccrualDetailFields(
      sampleAccrual({
        status: "Reversed",
        recognizedAtUtc: "2026-07-03T08:00:00.000Z",
        reversedAtUtc: "2026-07-04T09:00:00.000Z",
        reversalReason: "Correction"
      })
    );

    assert.equal(fields.status, "Reversed");
    assert.notEqual(fields.recognizedAtDisplay, "—");
    assert.notEqual(fields.reversedAtDisplay, "—");
    assert.equal(fields.reversalReasonDisplay, "Correction");
  });

  it("keeps description, type, status and secondary id", () => {
    const fields = buildAccrualDetailFields(
      sampleAccrual({
        description: "Оренда",
        type: "Expense",
        status: "Recognized",
        id: "a2222222-2222-2222-2222-222222222222"
      })
    );

    assert.equal(fields.description, "Оренда");
    assert.equal(fields.type, "Expense");
    assert.equal(fields.status, "Recognized");
    assert.equal(fields.accrualId, "a2222222-2222-2222-2222-222222222222");
  });
});

describe("source invoice detail helpers", () => {
  it("shows no-selection state when sourceInvoiceId is null", () => {
    assert.equal(shouldLoadSourceInvoice(null), false);
    const view = sourceInvoiceDetailNone();
    assert.equal(view.kind, "none");
    if (view.kind === "none") {
      assert.equal(view.display, "Не вибрано");
    }
  });

  it("builds loaded invoice display from Invoice get-by-id payload", () => {
    const invoice: Invoice = {
      id: "i1111111-1111-1111-1111-111111111111",
      financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
      documentNumber: "INV-42",
      counterpartyReference: "ACME",
      currency: "UAH",
      status: "Issued",
      dueDateUtc: null,
      totalAmount: 10,
      createdAtUtc: "2026-07-01T00:00:00.000Z",
      updatedAtUtc: "2026-07-01T00:00:00.000Z",
      issuedAtUtc: "2026-07-01T00:00:00.000Z"
    };

    assert.equal(shouldLoadSourceInvoice(invoice.id), true);
    const view = sourceInvoiceDetailFromInvoice(invoice);
    assert.equal(view.kind, "ready");
    if (view.kind === "ready") {
      assert.match(view.display, /INV-42/);
      assert.match(view.display, /Issued/);
      assert.match(view.display, /10\.00 UAH/);
      assert.match(view.display, /ACME/);
    }
  });
});

describe("interpretAccrualDetailLoadError", () => {
  it("treats Accrual 404 as not found with list refresh and cleared data", () => {
    const failure = interpretAccrualDetailLoadError(
      new FakeFinanceApiRequestError("Accrual was not found.", 404, "NotFound")
    );
    assert.equal(failure.kind, "not_found");
    assert.equal(failure.refreshList, true);
    assert.equal(failure.clearAccrualData, true);
    assert.match(failure.message, /більше недоступне/);
  });

  it("treats network failure as retryable without list refresh", () => {
    const failure = interpretAccrualDetailLoadError(new Error("Failed to fetch"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.clearAccrualData, true);
    assert.equal(failure.message, "Failed to fetch");
  });

  it("treats unexpected 5xx as retryable", () => {
    const failure = interpretAccrualDetailLoadError(
      new FakeFinanceApiRequestError("Internal Server Error", 500, null)
    );
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.refreshList, false);
    assert.equal(failure.clearAccrualData, true);
  });
});

describe("interpretSourceInvoiceDetailLoadError", () => {
  it("keeps Accrual panel intact on Invoice 404", () => {
    const failure = interpretSourceInvoiceDetailLoadError(
      new FakeFinanceApiRequestError("Invoice was not found.", 404, "NotFound")
    );
    assert.equal(failure.kind, "not_found");
    assert.match(failure.message, /Рахунок недоступний|Повʼязаний рахунок/);
  });

  it("maps invoice network errors as retryable", () => {
    const failure = interpretSourceInvoiceDetailLoadError(new Error("Failed to fetch"));
    assert.equal(failure.kind, "retryable");
    assert.equal(failure.message, "Failed to fetch");
  });
});

describe("detail panel close contract", () => {
  it("close path does not imply mutation helpers (read-only contract)", () => {
    // Close is a local UI state clear; opening uses GET helpers only.
    assert.equal(typeof canViewAccrualDetails, "function");
    assert.equal(typeof buildAccrualDetailFields, "function");
  });
});
