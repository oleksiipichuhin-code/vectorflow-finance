import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRecognizeAccrual,
  interpretAccrualRecognizeError,
  isDraftAccrual
} from "./accrualRecognize.ts";

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

describe("accrualRecognize", () => {
  it("detects draft status", () => {
    assert.equal(isDraftAccrual({ status: "Draft" }), true);
    assert.equal(isDraftAccrual({ status: "Recognized" }), false);
    assert.equal(isDraftAccrual({ status: "Reversed" }), false);
  });

  it("allows recognize only for draft accruals", () => {
    assert.equal(canRecognizeAccrual({ status: "Draft" }), true);
    assert.equal(canRecognizeAccrual({ status: "Recognized" }), false);
    assert.equal(canRecognizeAccrual({ status: "Reversed" }), false);
  });
});

describe("interpretAccrualRecognizeError", () => {
  it("keeps panel context on validation without list refresh", () => {
    const failure = interpretAccrualRecognizeError(
      new FakeFinanceApiRequestError("Already recognized", 400, "ValidationFailed")
    );
    assert.equal(failure.message, "Already recognized");
    assert.equal(failure.refreshList, false);
  });

  it("maps NotFound to refresh recovery", () => {
    const failure = interpretAccrualRecognizeError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.match(failure.message, /не знайдено/i);
    assert.equal(failure.refreshList, true);
  });

  it("maps Conflict to refresh recovery", () => {
    const failure = interpretAccrualRecognizeError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.match(failure.message, /змінено іншою дією/);
    assert.equal(failure.refreshList, true);
  });

  it("maps network errors without list refresh", () => {
    const failure = interpretAccrualRecognizeError(new Error("Failed to fetch"));
    assert.equal(failure.message, "Failed to fetch");
    assert.equal(failure.refreshList, false);
  });
});
