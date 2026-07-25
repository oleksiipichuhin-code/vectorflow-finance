import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCRUAL_PAGE_SIZE,
  buildAccrualListQuery,
  hasActiveAccrualFilters
} from "./accrualListQuery.ts";

describe("accrualListQuery", () => {
  it("omits status when All or unknown", () => {
    const empty = buildAccrualListQuery(1, ACCRUAL_PAGE_SIZE, {
      status: ""
    });
    assert.equal(empty.validationError, null);
    assert.equal(empty.query.status, undefined);

    const unknown = buildAccrualListQuery(1, ACCRUAL_PAGE_SIZE, {
      status: "Issued" as never
    });
    assert.equal(unknown.validationError, null);
    assert.equal(unknown.query.status, undefined);
  });

  it("includes exact Draft Recognized Reversed status", () => {
    for (const status of ["Draft", "Recognized", "Reversed"] as const) {
      const { query, validationError } = buildAccrualListQuery(2, ACCRUAL_PAGE_SIZE, {
        status
      });
      assert.equal(validationError, null);
      assert.equal(query.page, 2);
      assert.equal(query.status, status);
    }
  });

  it("composes status with description prefix and recognition dates", () => {
    const { query, validationError } = buildAccrualListQuery(1, ACCRUAL_PAGE_SIZE, {
      descriptionPrefix: "  Rent  ",
      status: "Recognized",
      recognitionFromDate: "2026-07-01",
      recognitionToDate: "2026-07-31"
    });

    assert.equal(validationError, null);
    assert.equal(query.descriptionPrefix, "Rent");
    assert.equal(query.status, "Recognized");
    assert.equal(query.recognitionFromUtc, "2026-07-01T00:00:00.000Z");
    assert.equal(query.recognitionToUtc, "2026-07-31T23:59:59.999Z");
  });

  it("treats status as an active filter", () => {
    assert.equal(hasActiveAccrualFilters({ status: "" }), false);
    assert.equal(hasActiveAccrualFilters({ status: "Draft" }), true);
    assert.equal(hasActiveAccrualFilters({ status: "Recognized" }), true);
    assert.equal(hasActiveAccrualFilters({ status: "Reversed" }), true);
  });
});
