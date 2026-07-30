import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REVERSAL_REASON_MAX_LENGTH,
  canReverseAccrual,
  interpretAccrualReverseError,
  isRecognizedAccrual,
  normalizeReversalReason
} from "./accrualReverse.ts";
import i18n from "./i18n/index.ts";

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("accrualReverse", () => {
  it("detects recognized status", () => {
    assert.equal(isRecognizedAccrual({ status: "Recognized" }), true);
    assert.equal(isRecognizedAccrual({ status: "Draft" }), false);
    assert.equal(isRecognizedAccrual({ status: "Reversed" }), false);
  });

  it("allows reverse only for recognized accruals", () => {
    assert.equal(canReverseAccrual({ status: "Recognized" }), true);
    assert.equal(canReverseAccrual({ status: "Draft" }), false);
    assert.equal(canReverseAccrual({ status: "Reversed" }), false);
  });

  it("trims and accepts a non-blank reversal reason", () => {
    assert.equal(normalizeReversalReason("  correction  "), "correction");
  });

  it("rejects blank or whitespace-only reasons", () => {
    const expected = new RegExp(
      escapeRegExp(i18n.t("accruals.error.reversalReasonRequired", { ns: "finance" }))
    );
    assert.throws(() => normalizeReversalReason(""), expected);
    assert.throws(() => normalizeReversalReason("   "), expected);
  });

  it("rejects reasons longer than domain max length", () => {
    const tooLong = "x".repeat(REVERSAL_REASON_MAX_LENGTH + 1);
    assert.throws(() => normalizeReversalReason(tooLong), /500/);
  });

  it("accepts a reason at the max length", () => {
    const max = "y".repeat(REVERSAL_REASON_MAX_LENGTH);
    assert.equal(normalizeReversalReason(max), max);
  });
});

describe("interpretAccrualReverseError", () => {
  it("keeps reverse form open on validation without list refresh", () => {
    const failure = interpretAccrualReverseError(
      new FakeFinanceApiRequestError("Reason required", 400, "ValidationFailed")
    );
    assert.equal(failure.message, "Reason required");
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
  });

  it("maps NotFound to closed form and refresh recovery", () => {
    const failure = interpretAccrualReverseError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(
      failure.message,
      i18n.t("accruals.error.notFoundRefreshed", { ns: "finance" })
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
  });

  it("maps Conflict to closed form and refresh recovery", () => {
    const failure = interpretAccrualReverseError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.message, i18n.t("accruals.error.reverseConflict", { ns: "finance" }));
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
  });

  it("maps network errors as keep-open without list refresh", () => {
    const failure = interpretAccrualReverseError(new Error("Failed to fetch"));
    assert.equal(failure.message, "Failed to fetch");
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
  });
});
