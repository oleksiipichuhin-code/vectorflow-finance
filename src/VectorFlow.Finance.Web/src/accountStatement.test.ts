import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_STATEMENT_PERIOD,
  buildStatementPeriodQuery,
  hasActiveStatementPeriod,
  validateStatementPeriodRange
} from "./accountStatement.ts";

describe("accountStatement period helpers", () => {
  it("builds empty query when no dates set", () => {
    const { query, validationError } = buildStatementPeriodQuery(EMPTY_STATEMENT_PERIOD);
    assert.equal(validationError, null);
    assert.deepEqual(query, {});
    assert.equal(hasActiveStatementPeriod(EMPTY_STATEMENT_PERIOD), false);
  });

  it("maps date inputs to inclusive UTC bounds", () => {
    const { query, validationError } = buildStatementPeriodQuery({
      periodFromDate: "2026-07-01",
      periodToDate: "2026-07-31"
    });
    assert.equal(validationError, null);
    assert.equal(query.periodFromUtc, "2026-07-01T00:00:00.000Z");
    assert.equal(query.periodToUtc, "2026-07-31T23:59:59.999Z");
    assert.equal(
      hasActiveStatementPeriod({
        periodFromDate: "2026-07-01",
        periodToDate: "2026-07-31"
      }),
      true
    );
  });

  it("rejects inverted period range", () => {
    assert.equal(
      validateStatementPeriodRange("2026-08-01", "2026-07-01"),
      "Дата «з» не може бути пізніше за дату «по»."
    );
    const { query, validationError } = buildStatementPeriodQuery({
      periodFromDate: "2026-08-01",
      periodToDate: "2026-07-01"
    });
    assert.equal(validationError, "Дата «з» не може бути пізніше за дату «по».");
    assert.deepEqual(query, {});
  });

  it("allows open-ended single bound", () => {
    const fromOnly = buildStatementPeriodQuery({
      periodFromDate: "2026-07-15",
      periodToDate: ""
    });
    assert.equal(fromOnly.validationError, null);
    assert.equal(fromOnly.query.periodFromUtc, "2026-07-15T00:00:00.000Z");
    assert.equal(fromOnly.query.periodToUtc, undefined);

    const toOnly = buildStatementPeriodQuery({
      periodFromDate: "",
      periodToDate: "2026-07-20"
    });
    assert.equal(toOnly.validationError, null);
    assert.equal(toOnly.query.periodFromUtc, undefined);
    assert.equal(toOnly.query.periodToUtc, "2026-07-20T23:59:59.999Z");
  });
});
