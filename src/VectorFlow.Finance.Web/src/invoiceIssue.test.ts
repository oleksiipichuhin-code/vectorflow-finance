import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDueDateInputValue,
  getInvoiceIssueReadiness,
  interpretInvoiceIssueError,
  isDraftInvoice,
  toDueDateUtcIso
} from "./invoiceIssue.ts";

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

describe("interpretInvoiceIssueError", () => {
  it("keeps prepare workflow open on 400 without list refresh", () => {
    const failure = interpretInvoiceIssueError(
      new FakeFinanceApiRequestError("Due date required", 400, "ValidationFailed")
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Due date required");
  });

  it("maps 404 to closed workflow with list refresh", () => {
    const failure = interpretInvoiceIssueError(
      new FakeFinanceApiRequestError("Missing", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /не знайдено/);
  });

  it("maps 409 to closed workflow with list refresh and no auto-retry guidance", () => {
    const failure = interpretInvoiceIssueError(
      new FakeFinanceApiRequestError("Conflict", 409, "Conflict")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /змінено іншою дією/);
    assert.doesNotMatch(failure.message, /автоматичн/i);
  });

  it("keeps workflow open on network errors without list refresh", () => {
    const failure = interpretInvoiceIssueError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });
});
