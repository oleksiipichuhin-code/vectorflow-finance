import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditAccrualAmount,
  formatAccrualAmountInput,
  interpretAccrualAmountEditError,
  parseAccrualAmountInput
} from "./accrualEditAmount.ts";
import { canRecognizeAccrual } from "./accrualRecognize.ts";
import { canReverseAccrual } from "./accrualReverse.ts";
import i18n from "./i18n/index.ts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectedError(key: string): RegExp {
  return new RegExp(escapeRegExp(i18n.t(key, { ns: "finance" })));
}

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

describe("canEditAccrualAmount", () => {
  it("allows edit only for Draft", () => {
    assert.equal(canEditAccrualAmount({ status: "Draft" }), true);
    assert.equal(canEditAccrualAmount({ status: "Recognized" }), false);
    assert.equal(canEditAccrualAmount({ status: "Reversed" }), false);
  });

  it("keeps recognize and reverse eligibility unchanged", () => {
    assert.equal(canRecognizeAccrual({ status: "Draft" }), true);
    assert.equal(canRecognizeAccrual({ status: "Recognized" }), false);
    assert.equal(canRecognizeAccrual({ status: "Reversed" }), false);
    assert.equal(canReverseAccrual({ status: "Draft" }), false);
    assert.equal(canReverseAccrual({ status: "Recognized" }), true);
    assert.equal(canReverseAccrual({ status: "Reversed" }), false);
  });
});

describe("formatAccrualAmountInput", () => {
  it("prefills current major-unit amount with two decimal places", () => {
    assert.equal(formatAccrualAmountInput(125.5), "125.50");
    assert.equal(formatAccrualAmountInput(100), "100.00");
  });
});

describe("parseAccrualAmountInput", () => {
  it("accepts comma and dot decimal separators for major units", () => {
    assert.equal(parseAccrualAmountInput("125,50"), 125.5);
    assert.equal(parseAccrualAmountInput("125.50"), 125.5);
    assert.equal(parseAccrualAmountInput(" 10 "), 10);
  });

  it("rejects blank, non-numeric, zero, and negative values without mutation", () => {
    const numeric = expectedError("accruals.error.amountNumeric");
    const positive = expectedError("accruals.error.amountPositive");
    assert.throws(() => parseAccrualAmountInput(""), numeric);
    assert.throws(() => parseAccrualAmountInput("abc"), numeric);
    assert.throws(() => parseAccrualAmountInput("0"), positive);
    assert.throws(() => parseAccrualAmountInput("-1"), Error);
    assert.throws(() => parseAccrualAmountInput("12.34.56"), numeric);
  });
});

describe("interpretAccrualAmountEditError", () => {
  it("keeps editor open for validation failures", () => {
    const failure = interpretAccrualAmountEditError(
      new FakeFinanceApiRequestError(
        "Accrual amount must be greater than zero.",
        400,
        "ValidationFailed"
      )
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.match(failure.message, /greater than zero/);
  });

  it("maps NotFound to operator message, closes editor, and refreshes", () => {
    const failure = interpretAccrualAmountEditError(
      new FakeFinanceApiRequestError("Accrual was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.equal(
      failure.message,
      i18n.t("accruals.error.notFoundRefreshed", { ns: "finance" })
    );
  });

  it("maps Conflict to concurrency guidance, closes editor, and refreshes", () => {
    const failure = interpretAccrualAmountEditError(
      new FakeFinanceApiRequestError(
        "The accrual was modified by another request. Reload and retry.",
        409,
        "Conflict"
      )
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.equal(failure.message, i18n.t("accruals.error.editorConflict", { ns: "finance" }));
  });

  it("keeps editor open for network-style errors without refresh", () => {
    const failure = interpretAccrualAmountEditError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });
});
