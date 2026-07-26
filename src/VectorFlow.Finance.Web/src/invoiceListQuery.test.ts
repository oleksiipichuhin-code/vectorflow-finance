import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoiceListQuery,
  hasActiveInvoiceFilters,
  INVOICE_PAGE_SIZE
} from "./invoiceListQuery.ts";

describe("invoiceListQuery", () => {
  it("builds paged query with exact document number and status", () => {
    const { query, validationError } = buildInvoiceListQuery(2, INVOICE_PAGE_SIZE, {
      documentNumber: "  INV-9  ",
      status: "Issued",
      createdFromDate: "",
      createdToDate: ""
    });

    assert.equal(validationError, null);
    assert.deepEqual(query, {
      page: 2,
      pageSize: INVOICE_PAGE_SIZE,
      documentNumber: "INV-9",
      status: "Issued"
    });
  });

  it("omits blank filters and validates created date range", () => {
    const blank = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      documentNumber: " ",
      status: "",
      createdFromDate: "",
      createdToDate: ""
    });
    assert.equal(blank.validationError, null);
    assert.deepEqual(blank.query, { page: 1, pageSize: INVOICE_PAGE_SIZE });

    const invalidRange = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      createdFromDate: "2026-07-10",
      createdToDate: "2026-07-01"
    });
    assert.match(invalidRange.validationError ?? "", /не може бути пізніше/);
  });

  it("detects active invoice filters", () => {
    assert.equal(hasActiveInvoiceFilters({}), false);
    assert.equal(hasActiveInvoiceFilters({ documentNumber: "INV" }), true);
    assert.equal(hasActiveInvoiceFilters({ status: "Draft" }), true);
  });
});
