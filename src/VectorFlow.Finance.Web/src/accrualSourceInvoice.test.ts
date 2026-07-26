import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SOURCE_INVOICE_PICKER_PAGE_SIZE,
  buildSourceInvoicePickerQuery,
  canChangeAccrualSourceInvoice,
  formatAccrualSourceInvoiceListCell,
  formatSourceInvoiceSelection,
  hasSourceInvoiceSelectionChanged,
  interpretAccrualSourceInvoiceEditError,
  normalizePickerDocumentNumber,
  toInvoicePickerSummary
} from "./accrualSourceInvoice.ts";
import { canEditAccrualAmount } from "./accrualEditAmount.ts";
import { canRecognizeAccrual } from "./accrualRecognize.ts";
import { canReverseAccrual } from "./accrualReverse.ts";

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

describe("canChangeAccrualSourceInvoice", () => {
  it("allows source invoice edit only for Draft", () => {
    assert.equal(canChangeAccrualSourceInvoice({ status: "Draft" }), true);
    assert.equal(canChangeAccrualSourceInvoice({ status: "Recognized" }), false);
    assert.equal(canChangeAccrualSourceInvoice({ status: "Reversed" }), false);
  });

  it("keeps amount edit, recognize, and reverse eligibility unchanged", () => {
    assert.equal(canEditAccrualAmount({ status: "Draft" }), true);
    assert.equal(canEditAccrualAmount({ status: "Recognized" }), false);
    assert.equal(canRecognizeAccrual({ status: "Draft" }), true);
    assert.equal(canReverseAccrual({ status: "Recognized" }), true);
    assert.equal(canReverseAccrual({ status: "Draft" }), false);
  });
});

describe("source invoice selection display", () => {
  it("shows no-selection state", () => {
    assert.equal(formatSourceInvoiceSelection(null), "Не вибрано");
    assert.equal(formatAccrualSourceInvoiceListCell(null, null), "—");
  });

  it("shows current selection from invoice summary fields only", () => {
    const summary = toInvoicePickerSummary({
      id: "inv-1",
      financeWorkspaceId: "ws-1",
      documentNumber: "INV-100",
      counterpartyReference: "cp-a",
      currency: "UAH",
      status: "Issued",
      dueDateUtc: null,
      totalAmount: 50,
      createdAtUtc: "2026-01-01T00:00:00.000Z",
      updatedAtUtc: "2026-01-01T00:00:00.000Z",
      issuedAtUtc: "2026-01-02T00:00:00.000Z"
    });

    assert.equal(summary.documentNumber, "INV-100");
    assert.match(formatSourceInvoiceSelection(summary), /INV-100/);
    assert.match(formatSourceInvoiceSelection(summary), /Issued/);
    assert.match(formatSourceInvoiceSelection(summary), /50\.00 UAH/);
    assert.match(formatSourceInvoiceSelection(summary), /cp-a/);
    assert.equal(formatAccrualSourceInvoiceListCell("inv-1", summary), "INV-100");
    assert.equal(formatAccrualSourceInvoiceListCell("inv-1", null), "Вибрано");
  });
});

describe("buildSourceInvoicePickerQuery", () => {
  it("serializes workspace paged query with exact document number and page size", () => {
    const { query, validationError } = buildSourceInvoicePickerQuery(2, "  INV-42  ");
    assert.equal(validationError, null);
    assert.deepEqual(query, {
      page: 2,
      pageSize: SOURCE_INVOICE_PICKER_PAGE_SIZE,
      documentNumber: "INV-42"
    });
    assert.equal(SOURCE_INVOICE_PICKER_PAGE_SIZE, 10);
  });

  it("omits document number when blank and rejects page below 1", () => {
    const blank = buildSourceInvoicePickerQuery(1, "   ");
    assert.equal(blank.validationError, null);
    assert.deepEqual(blank.query, {
      page: 1,
      pageSize: SOURCE_INVOICE_PICKER_PAGE_SIZE
    });

    const invalidPage = buildSourceInvoicePickerQuery(0, "INV");
    assert.match(invalidPage.validationError ?? "", /сторінки/);
  });

  it("normalizes picker document number by trim only", () => {
    assert.equal(normalizePickerDocumentNumber("  INV-1  "), "INV-1");
  });
});

describe("hasSourceInvoiceSelectionChanged", () => {
  it("detects select and clear changes, and ignores no-op", () => {
    assert.equal(hasSourceInvoiceSelectionChanged(null, null), false);
    assert.equal(hasSourceInvoiceSelectionChanged("a", "a"), false);
    assert.equal(hasSourceInvoiceSelectionChanged(null, "a"), true);
    assert.equal(hasSourceInvoiceSelectionChanged("a", null), true);
    assert.equal(hasSourceInvoiceSelectionChanged("a", "b"), true);
  });
});

describe("interpretAccrualSourceInvoiceEditError", () => {
  it("keeps editor open for validation failures", () => {
    const failure = interpretAccrualSourceInvoiceEditError(
      new FakeFinanceApiRequestError("Source invoice id is invalid.", 400, "ValidationFailed")
    );
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.match(failure.message, /invalid/i);
  });

  it("maps Accrual NotFound to closed editor and refresh", () => {
    const failure = interpretAccrualSourceInvoiceEditError(
      new FakeFinanceApiRequestError("Accrual was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /Нарахування не знайдено/);
  });

  it("maps Invoice NotFound to closed editor and refresh", () => {
    const failure = interpretAccrualSourceInvoiceEditError(
      new FakeFinanceApiRequestError("Invoice was not found.", 404, "NotFound")
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /Рахунок більше недоступний/);
  });

  it("maps Conflict to concurrency guidance with refresh", () => {
    const failure = interpretAccrualSourceInvoiceEditError(
      new FakeFinanceApiRequestError(
        "The accrual was modified by another request. Reload and retry.",
        409,
        "Conflict"
      )
    );
    assert.equal(failure.keepEditorOpen, false);
    assert.equal(failure.refreshList, true);
    assert.match(failure.message, /змінено іншою дією/i);
  });

  it("keeps editor open for network errors without refresh", () => {
    const failure = interpretAccrualSourceInvoiceEditError(new Error("Failed to fetch"));
    assert.equal(failure.keepEditorOpen, true);
    assert.equal(failure.refreshList, false);
    assert.equal(failure.message, "Failed to fetch");
  });
});
