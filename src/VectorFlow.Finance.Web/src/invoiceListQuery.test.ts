import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInvoiceListQuery,
  hasActiveInvoiceFilters,
  INVOICE_PAGE_SIZE,
  validateDueDateRange,
  validateIssuedDateRange
} from "./invoiceListQuery.ts";

describe("invoiceListQuery", () => {
  it("builds paged query with exact document number and status", () => {
    const { query, validationError } = buildInvoiceListQuery(2, INVOICE_PAGE_SIZE, {
      documentNumber: "  INV-9  ",
      status: "Issued",
      createdFromDate: "",
      createdToDate: "",
      dueFromDate: "",
      dueToDate: ""
    });

    assert.equal(validationError, null);
    assert.deepEqual(query, {
      page: 2,
      pageSize: INVOICE_PAGE_SIZE,
      documentNumber: "INV-9",
      status: "Issued"
    });
  });

  it("maps due date inputs to inclusive UTC bounds", () => {
    const { query, validationError } = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      status: "Issued",
      dueFromDate: "2026-08-01",
      dueToDate: "2026-08-31"
    });

    assert.equal(validationError, null);
    assert.equal(query.status, "Issued");
    assert.equal(query.dueFromUtc, "2026-08-01T00:00:00.000Z");
    assert.equal(query.dueToUtc, "2026-08-31T23:59:59.999Z");
  });

  it("maps counterparty and issued dates into a combined Issued search query", () => {
    const { query, validationError } = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      documentNumber: " INV-SEARCH ",
      counterpartyReference: "  acme-ua  ",
      status: "Issued",
      issuedFromDate: "2026-07-01",
      issuedToDate: "2026-07-31",
      dueFromDate: "2026-08-01",
      dueToDate: "2026-08-31"
    });

    assert.equal(validationError, null);
    assert.deepEqual(query, {
      page: 1,
      pageSize: INVOICE_PAGE_SIZE,
      documentNumber: "INV-SEARCH",
      counterpartyReference: "acme-ua",
      status: "Issued",
      issuedFromUtc: "2026-07-01T00:00:00.000Z",
      issuedToUtc: "2026-07-31T23:59:59.999Z",
      dueFromUtc: "2026-08-01T00:00:00.000Z",
      dueToUtc: "2026-08-31T23:59:59.999Z"
    });
  });

  it("allows open-ended issued and due date bounds independently", () => {
    const fromOnly = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      dueFromDate: "2026-07-15"
    });
    assert.equal(fromOnly.validationError, null);
    assert.equal(fromOnly.query.dueFromUtc, "2026-07-15T00:00:00.000Z");
    assert.equal(fromOnly.query.dueToUtc, undefined);

    const toOnly = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      dueToDate: "2026-07-20"
    });
    assert.equal(toOnly.validationError, null);
    assert.equal(toOnly.query.dueToUtc, "2026-07-20T23:59:59.999Z");
    assert.equal(toOnly.query.dueFromUtc, undefined);

    const issuedFromOnly = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      issuedFromDate: "2026-06-01"
    });
    assert.equal(issuedFromOnly.validationError, null);
    assert.equal(issuedFromOnly.query.issuedFromUtc, "2026-06-01T00:00:00.000Z");
    assert.equal(issuedFromOnly.query.issuedToUtc, undefined);
  });

  it("omits blank filters and validates created, issued, and due date ranges", () => {
    const blank = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      documentNumber: " ",
      counterpartyReference: " ",
      status: "",
      createdFromDate: "",
      createdToDate: "",
      issuedFromDate: "",
      issuedToDate: "",
      dueFromDate: "",
      dueToDate: ""
    });
    assert.equal(blank.validationError, null);
    assert.deepEqual(blank.query, { page: 1, pageSize: INVOICE_PAGE_SIZE });

    const invalidCreated = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      createdFromDate: "2026-07-10",
      createdToDate: "2026-07-01"
    });
    assert.match(invalidCreated.validationError ?? "", /не може бути пізніше/);

    const invalidIssued = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      issuedFromDate: "2026-07-31",
      issuedToDate: "2026-07-01"
    });
    assert.match(invalidIssued.validationError ?? "", /Дата виставлення/);
    assert.equal(validateIssuedDateRange("2026-07-01", "2026-07-31"), null);

    const invalidDue = buildInvoiceListQuery(1, INVOICE_PAGE_SIZE, {
      dueFromDate: "2026-08-31",
      dueToDate: "2026-08-01"
    });
    assert.match(invalidDue.validationError ?? "", /Строк оплати/);
    assert.equal(validateDueDateRange("2026-08-01", "2026-08-31"), null);
  });

  it("detects active invoice filters including counterparty and issued dates", () => {
    assert.equal(hasActiveInvoiceFilters({}), false);
    assert.equal(hasActiveInvoiceFilters({ documentNumber: "INV" }), true);
    assert.equal(hasActiveInvoiceFilters({ counterpartyReference: "acme" }), true);
    assert.equal(hasActiveInvoiceFilters({ status: "Draft" }), true);
    assert.equal(hasActiveInvoiceFilters({ issuedFromDate: "2026-07-01" }), true);
    assert.equal(hasActiveInvoiceFilters({ issuedToDate: "2026-07-31" }), true);
    assert.equal(hasActiveInvoiceFilters({ dueFromDate: "2026-08-01" }), true);
    assert.equal(hasActiveInvoiceFilters({ dueToDate: "2026-08-31" }), true);
  });
});
