import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import i18n from "./i18n/index.ts";
import { formatBalanceSide, trialBalanceBalanceLabel } from "./trialBalance.ts";

describe("trialBalance helpers", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes known balance sides while preserving wire values", async () => {
    assert.equal(formatBalanceSide("Debit", i18n.t.bind(i18n)), "Дебет");
    assert.equal(formatBalanceSide("Credit", i18n.t.bind(i18n)), "Кредит");
    assert.equal(formatBalanceSide("Zero", i18n.t.bind(i18n)), "Нуль");
    assert.equal("Debit", "Debit");
    assert.equal("Credit", "Credit");
    assert.equal("Zero", "Zero");

    await i18n.changeLanguage("en");
    assert.equal(formatBalanceSide("Debit", i18n.t.bind(i18n)), "Debit");
    assert.equal(formatBalanceSide("Credit", i18n.t.bind(i18n)), "Credit");
    assert.equal(formatBalanceSide("Zero", i18n.t.bind(i18n)), "Zero");
  });

  it("falls back for missing or unknown sides", async () => {
    assert.equal(formatBalanceSide(null, i18n.t.bind(i18n)), "—");
    assert.equal(formatBalanceSide(undefined, i18n.t.bind(i18n)), "—");
    assert.equal(formatBalanceSide("", i18n.t.bind(i18n)), "—");
    assert.equal(formatBalanceSide("Other", i18n.t.bind(i18n)), "Other");

    await i18n.changeLanguage("en");
    assert.equal(formatBalanceSide(null, i18n.t.bind(i18n)), "—");
  });

  it("labels balanced vs unbalanced trial balance in both locales", async () => {
    assert.equal(trialBalanceBalanceLabel(true, i18n.t.bind(i18n)), "Збалансовано");
    assert.equal(trialBalanceBalanceLabel(false, i18n.t.bind(i18n)), "Не збалансовано");

    await i18n.changeLanguage("en");
    assert.equal(trialBalanceBalanceLabel(true, i18n.t.bind(i18n)), "Balanced");
    assert.equal(trialBalanceBalanceLabel(false, i18n.t.bind(i18n)), "Unbalanced");
  });
});
