import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REVERSAL_REASON_MAX_LENGTH,
  canReverseAccrual,
  isRecognizedAccrual,
  normalizeReversalReason
} from "./accrualReverse.ts";

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
    assert.throws(() => normalizeReversalReason(""), /причину/);
    assert.throws(() => normalizeReversalReason("   "), /причину/);
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
