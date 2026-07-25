import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRecognizeAccrual, isDraftAccrual } from "./accrualRecognize.ts";

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
