import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretCreateAccrualError } from "./accrualCreate.ts";
import { formatSourceInvoiceSelection } from "./accrualSourceInvoice.ts";

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

describe("create accrual Source Invoice UX helpers", () => {
  it("defaults optional Source Invoice section to no selection", () => {
    assert.equal(formatSourceInvoiceSelection(null), "Не вибрано");
  });
});

describe("interpretCreateAccrualError", () => {
  it("keeps form open and selection for 400 validation", () => {
    const failure = interpretCreateAccrualError(
      new FakeFinanceApiRequestError(
        "Accrual description must not be blank.",
        400,
        "ValidationFailed"
      )
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.clearSourceInvoiceSelection, false);
    assert.match(failure.message, /must not be blank/);
  });

  it("maps missing Invoice 404 to operator message and clears stale selection", () => {
    const failure = interpretCreateAccrualError(
      new FakeFinanceApiRequestError("Invoice was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.clearSourceInvoiceSelection, true);
    assert.match(failure.message, /рахунок/i);
  });

  it("maps workspace 404 without clearing Source Invoice selection", () => {
    const failure = interpretCreateAccrualError(
      new FakeFinanceApiRequestError("Finance workspace was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.clearSourceInvoiceSelection, false);
    assert.match(failure.message, /простір/i);
  });

  it("maps 409 conflict without auto-retry and keeps form open", () => {
    const failure = interpretCreateAccrualError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.clearSourceInvoiceSelection, false);
    assert.match(failure.message, /конфлікт/i);
  });

  it("keeps form and selection for network failures", () => {
    const failure = interpretCreateAccrualError(new Error("Failed to fetch"));
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.clearSourceInvoiceSelection, false);
    assert.equal(failure.message, "Failed to fetch");
  });

  it("keeps form open for unexpected 5xx", () => {
    const failure = interpretCreateAccrualError(
      new FakeFinanceApiRequestError("Internal Server Error", 500, null)
    );
    assert.equal(failure.keepFormOpen, true);
    assert.equal(failure.clearSourceInvoiceSelection, false);
    assert.match(failure.message, /Internal Server Error/);
  });
});
