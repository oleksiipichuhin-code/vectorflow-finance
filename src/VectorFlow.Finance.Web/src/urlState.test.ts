import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_ACCRUAL_FILTERS,
  EMPTY_INVOICE_FILTERS,
  buildUrlSearch,
  draftInvoicesDiscovery,
  parseUrlSearch
} from "./urlState.ts";

describe("urlState", () => {
  it("parses empty search as dashboard defaults", () => {
    const state = parseUrlSearch("");
    assert.equal(state.view, "dashboard");
    assert.equal(state.workspaceId, null);
    assert.equal(state.discovery.page, 1);
    assert.deepEqual(state.discovery.invoiceFilters, EMPTY_INVOICE_FILTERS);
    assert.deepEqual(state.discovery.accrualFilters, EMPTY_ACCRUAL_FILTERS);
  });

  it("round-trips draft invoices discovery", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const discovery = draftInvoicesDiscovery();
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      discovery
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Draft"
    );

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.view, "invoices");
    assert.equal(parsed.workspaceId, workspaceId);
    assert.equal(parsed.discovery.page, 1);
    assert.equal(parsed.discovery.invoiceFilters.status, "Draft");
    assert.equal(parsed.discovery.invoiceFilters.documentNumber, "");
  });

  it("omits incompatible list params for the active view", () => {
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId: null,
      discovery: {
        page: 2,
        invoiceFilters: {
          documentNumber: "INV-1",
          status: "Issued",
          createdFromDate: "2026-07-01",
          createdToDate: "2026-07-24"
        },
        accrualFilters: {
          descriptionPrefix: "Rent",
          recognitionFromDate: "2026-07-01",
          recognitionToDate: "2026-07-24"
        }
      }
    });

    assert.equal(
      search,
      "?view=invoices&documentNumber=INV-1&status=Issued&createdFrom=2026-07-01&createdTo=2026-07-24&page=2"
    );
    assert.equal(search.includes("descriptionPrefix"), false);
    assert.equal(search.includes("recognitionFrom"), false);
  });

  it("parses accrual discovery and ignores invalid page or dates", () => {
    const parsed = parseUrlSearch(
      "?view=accruals&descriptionPrefix=Оренда&recognitionFrom=2026-07-10&recognitionTo=nope&page=0"
    );
    assert.equal(parsed.view, "accruals");
    assert.equal(parsed.discovery.page, 1);
    assert.equal(parsed.discovery.accrualFilters.descriptionPrefix, "Оренда");
    assert.equal(parsed.discovery.accrualFilters.recognitionFromDate, "2026-07-10");
    assert.equal(parsed.discovery.accrualFilters.recognitionToDate, "");
  });

  it("rejects invalid workspace ids and unknown views", () => {
    const parsed = parseUrlSearch("?view=ledger&workspaceId=not-a-guid&status=Draft");
    assert.equal(parsed.view, "dashboard");
    assert.equal(parsed.workspaceId, null);
  });

  it("draftInvoicesDiscovery clears conflicting invoice filters and page", () => {
    const discovery = draftInvoicesDiscovery();
    assert.equal(discovery.page, 1);
    assert.equal(discovery.invoiceFilters.status, "Draft");
    assert.equal(discovery.invoiceFilters.documentNumber, "");
    assert.equal(discovery.invoiceFilters.createdFromDate, "");
    assert.equal(discovery.invoiceFilters.createdToDate, "");
  });
});
