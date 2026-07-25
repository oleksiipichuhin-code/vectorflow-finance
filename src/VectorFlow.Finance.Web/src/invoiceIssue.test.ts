import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDueDateInputValue,
  getInvoiceIssueReadiness,
  isDraftInvoice,
  toDueDateUtcIso
} from "./invoiceIssue.ts";

describe("invoiceIssue", () => {
  it("detects draft status", () => {
    assert.equal(isDraftInvoice({ status: "Draft" }), true);
    assert.equal(isDraftInvoice({ status: "Issued" }), false);
  });

  it("marks draft without due date or positive total as not ready", () => {
    const readiness = getInvoiceIssueReadiness({
      status: "Draft",
      dueDateUtc: null,
      totalAmount: 0
    });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.needsDueDate, true);
    assert.equal(readiness.needsLine, true);
  });

  it("marks draft with due date and positive total as ready", () => {
    const readiness = getInvoiceIssueReadiness({
      status: "Draft",
      dueDateUtc: "2030-01-15T00:00:00.000Z",
      totalAmount: 25
    });
    assert.equal(readiness.ready, true);
    assert.equal(readiness.needsDueDate, false);
    assert.equal(readiness.needsLine, false);
  });

  it("does not treat issued invoices as ready to issue", () => {
    const readiness = getInvoiceIssueReadiness({
      status: "Issued",
      dueDateUtc: "2030-01-15T00:00:00.000Z",
      totalAmount: 25
    });
    assert.equal(readiness.ready, false);
    assert.equal(readiness.needsDueDate, false);
    assert.equal(readiness.needsLine, false);
  });

  it("converts date input to UTC midnight ISO", () => {
    assert.equal(toDueDateUtcIso("2030-01-15"), "2030-01-15T00:00:00.000Z");
  });

  it("rejects invalid due date input", () => {
    assert.throws(() => toDueDateUtcIso("15-01-2030"), /YYYY-MM-DD/);
  });

  it("defaults due date thirty UTC days ahead", () => {
    const from = new Date(Date.UTC(2026, 6, 24));
    assert.equal(defaultDueDateInputValue(from), "2026-08-23");
  });
});
