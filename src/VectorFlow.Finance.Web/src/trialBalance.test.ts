import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBalanceSide, trialBalanceBalanceLabel } from "./trialBalance.ts";

describe("trialBalance helpers", () => {
  it("formats known balance sides", () => {
    assert.equal(formatBalanceSide("Debit"), "Debit");
    assert.equal(formatBalanceSide("Credit"), "Credit");
    assert.equal(formatBalanceSide("Zero"), "Zero");
  });

  it("falls back for missing or unknown sides", () => {
    assert.equal(formatBalanceSide(null), "—");
    assert.equal(formatBalanceSide(undefined), "—");
    assert.equal(formatBalanceSide(""), "—");
    assert.equal(formatBalanceSide("Other"), "Other");
  });

  it("labels balanced vs unbalanced trial balance", () => {
    assert.equal(trialBalanceBalanceLabel(true), "Збалансовано");
    assert.equal(trialBalanceBalanceLabel(false), "Не збалансовано");
  });
});
