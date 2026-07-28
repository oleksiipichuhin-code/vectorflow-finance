import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_ACCRUAL_FILTERS,
  EMPTY_INVOICE_FILTERS,
  buildUrlSearch,
  draftInvoicesDiscovery,
  issuedInvoicesDiscovery,
  overdueIssuedInvoicesDiscovery,
  parseAccrualIdParam,
  parseInvoiceIdParam,
  parseUrlSearch,
  withAccrualId,
  withInvoiceId,
  withoutAccrualId,
  withoutInvoiceId
} from "./urlState.ts";

describe("urlState", () => {
  it("parses empty search as dashboard defaults", () => {
    const state = parseUrlSearch("");
    assert.equal(state.view, "dashboard");
    assert.equal(state.workspaceId, null);
    assert.equal(state.accrualId, null);
    assert.equal(state.invoiceId, null);
    assert.equal(state.discovery.page, 1);
    assert.deepEqual(state.discovery.invoiceFilters, EMPTY_INVOICE_FILTERS);
    assert.deepEqual(state.discovery.accrualFilters, EMPTY_ACCRUAL_FILTERS);
    assert.equal(state.discovery.invoiceQueue, "");
  });

  it("round-trips draft invoices discovery", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const discovery = draftInvoicesDiscovery();
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Draft"
    );

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.view, "invoices");
    assert.equal(parsed.workspaceId, workspaceId);
    assert.equal(parsed.accrualId, null);
    assert.equal(parsed.invoiceId, null);
    assert.equal(parsed.discovery.page, 1);
    assert.equal(parsed.discovery.invoiceFilters.status, "Draft");
    assert.equal(parsed.discovery.invoiceFilters.documentNumber, "");
  });

  it("omits incompatible list params for the active view", () => {
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId: null,
      accrualId: "a1111111-1111-1111-1111-111111111111",
      invoiceId: null,
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
          status: "Recognized",
          recognitionFromDate: "2026-07-01",
          recognitionToDate: "2026-07-24"
        },
        invoiceQueue: ""
      }
    });

    assert.equal(
      search,
      "?view=invoices&documentNumber=INV-1&status=Issued&createdFrom=2026-07-01&createdTo=2026-07-24&page=2"
    );
    assert.equal(search.includes("descriptionPrefix"), false);
    assert.equal(search.includes("recognitionFrom"), false);
    assert.equal(search.includes("accrualId"), false);
  });

  it("round-trips invoice due date filters in shareable URL", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery: {
        page: 1,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          status: "Issued",
          dueFromDate: "2026-08-01",
          dueToDate: "2026-08-31"
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: ""
      }
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Issued&dueFrom=2026-08-01&dueTo=2026-08-31"
    );

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.view, "invoices");
    assert.equal(parsed.discovery.invoiceFilters.status, "Issued");
    assert.equal(parsed.discovery.invoiceFilters.dueFromDate, "2026-08-01");
    assert.equal(parsed.discovery.invoiceFilters.dueToDate, "2026-08-31");
    assert.equal(parsed.discovery.invoiceFilters.createdFromDate, "");

    const invalidDue = parseUrlSearch("?view=invoices&dueFrom=08-01-2026&dueTo=nope");
    assert.equal(invalidDue.discovery.invoiceFilters.dueFromDate, "");
    assert.equal(invalidDue.discovery.invoiceFilters.dueToDate, "");
  });

  it("round-trips Issued search filters: counterparty, issued window, due window, document", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: "b1111111-1111-1111-1111-111111111111",
      discovery: {
        page: 2,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          documentNumber: "INV-SEARCH",
          counterpartyReference: "acme-ua",
          status: "Issued",
          issuedFromDate: "2026-07-01",
          issuedToDate: "2026-07-31",
          dueFromDate: "2026-08-01",
          dueToDate: "2026-08-31"
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: ""
      }
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&documentNumber=INV-SEARCH&counterpartyReference=acme-ua&status=Issued&issuedFrom=2026-07-01&issuedTo=2026-07-31&dueFrom=2026-08-01&dueTo=2026-08-31&page=2&invoiceId=b1111111-1111-1111-1111-111111111111"
    );

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.discovery.page, 2);
    assert.equal(parsed.invoiceId, "b1111111-1111-1111-1111-111111111111");
    assert.equal(parsed.discovery.invoiceFilters.documentNumber, "INV-SEARCH");
    assert.equal(parsed.discovery.invoiceFilters.counterpartyReference, "acme-ua");
    assert.equal(parsed.discovery.invoiceFilters.status, "Issued");
    assert.equal(parsed.discovery.invoiceFilters.issuedFromDate, "2026-07-01");
    assert.equal(parsed.discovery.invoiceFilters.issuedToDate, "2026-07-31");
    assert.equal(parsed.discovery.invoiceFilters.dueFromDate, "2026-08-01");
    assert.equal(parsed.discovery.invoiceFilters.dueToDate, "2026-08-31");

    const invalidIssued = parseUrlSearch(
      "?view=invoices&issuedFrom=07-01-2026&issuedTo=bad&counterpartyReference=%20"
    );
    assert.equal(invalidIssued.discovery.invoiceFilters.issuedFromDate, "");
    assert.equal(invalidIssued.discovery.invoiceFilters.issuedToDate, "");
    assert.equal(invalidIssued.discovery.invoiceFilters.counterpartyReference, "");
  });

  it("parses accrual discovery and ignores invalid page or dates", () => {
    const parsed = parseUrlSearch(
      "?view=accruals&descriptionPrefix=Оренда&recognitionFrom=2026-07-10&recognitionTo=nope&page=0"
    );
    assert.equal(parsed.view, "accruals");
    assert.equal(parsed.discovery.page, 1);
    assert.equal(parsed.discovery.accrualFilters.descriptionPrefix, "Оренда");
    assert.equal(parsed.discovery.accrualFilters.status, "");
    assert.equal(parsed.discovery.accrualFilters.recognitionFromDate, "2026-07-10");
    assert.equal(parsed.discovery.accrualFilters.recognitionToDate, "");
    assert.equal(parsed.accrualId, null);
    assert.equal(parsed.invoiceId, null);
  });

  it("round-trips accrual status filter and normalizes unknown values", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "accruals",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery: {
        page: 1,
        invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
        accrualFilters: {
          ...EMPTY_ACCRUAL_FILTERS,
          status: "Recognized"
        },
        invoiceQueue: ""
      }
    });

    assert.equal(
      search,
      "?view=accruals&workspaceId=11111111-1111-1111-1111-111111111111&status=Recognized"
    );

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.discovery.accrualFilters.status, "Recognized");
    assert.equal(parsed.discovery.invoiceFilters.status, "");

    const unknown = parseUrlSearch("?view=accruals&status=Issued");
    assert.equal(unknown.discovery.accrualFilters.status, "");
    assert.equal(unknown.discovery.invoiceFilters.status, "Issued");
  });

  it("preserves other accrual filters when serializing status", () => {
    const search = buildUrlSearch({
      view: "accruals",
      workspaceId: null,
      accrualId: null,
      invoiceId: null,
      discovery: {
        page: 3,
        invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
        accrualFilters: {
          descriptionPrefix: "Rent",
          status: "Draft",
          recognitionFromDate: "2026-07-01",
          recognitionToDate: "2026-07-31"
        },
        invoiceQueue: ""
      }
    });

    assert.equal(
      search,
      "?view=accruals&descriptionPrefix=Rent&status=Draft&recognitionFrom=2026-07-01&recognitionTo=2026-07-31&page=3"
    );
  });

  it("rejects invalid workspace ids and unknown views", () => {
    const parsed = parseUrlSearch("?view=ledger&workspaceId=not-a-guid&status=Draft");
    assert.equal(parsed.view, "dashboard");
    assert.equal(parsed.workspaceId, null);
    assert.equal(parsed.accrualId, null);
    assert.equal(parsed.invoiceId, null);
  });

  it("draftInvoicesDiscovery clears conflicting invoice filters and page", () => {
    const discovery = draftInvoicesDiscovery();
    assert.equal(discovery.page, 1);
    assert.equal(discovery.invoiceFilters.status, "Draft");
    assert.equal(discovery.invoiceFilters.documentNumber, "");
    assert.equal(discovery.invoiceFilters.counterpartyReference, "");
    assert.equal(discovery.invoiceFilters.createdFromDate, "");
    assert.equal(discovery.invoiceFilters.createdToDate, "");
    assert.equal(discovery.invoiceFilters.issuedFromDate, "");
    assert.equal(discovery.invoiceFilters.issuedToDate, "");
    assert.equal(discovery.invoiceFilters.dueFromDate, "");
    assert.equal(discovery.invoiceFilters.dueToDate, "");
  });

  it("issuedInvoicesDiscovery opens Issued attention queue without inventing due window", () => {
    const discovery = issuedInvoicesDiscovery();
    assert.equal(discovery.page, 1);
    assert.equal(discovery.invoiceFilters.status, "Issued");
    assert.equal(discovery.invoiceQueue, "");
    assert.equal(discovery.invoiceFilters.documentNumber, "");
    assert.equal(discovery.invoiceFilters.counterpartyReference, "");
    assert.equal(discovery.invoiceFilters.createdFromDate, "");
    assert.equal(discovery.invoiceFilters.createdToDate, "");
    assert.equal(discovery.invoiceFilters.issuedFromDate, "");
    assert.equal(discovery.invoiceFilters.issuedToDate, "");
    assert.equal(discovery.invoiceFilters.dueFromDate, "");
    assert.equal(discovery.invoiceFilters.dueToDate, "");

    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery
    });
    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Issued"
    );
  });

  it("round-trips overdue issued invoice queue without freezing dueTo in URL", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const discovery = overdueIssuedInvoicesDiscovery();
    assert.equal(discovery.invoiceQueue, "overdue");
    assert.equal(discovery.agingBucket, "");
    assert.equal(discovery.invoiceFilters.status, "Issued");
    assert.equal(discovery.invoiceFilters.dueToDate, "");

    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery
    });
    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Issued&queue=overdue"
    );
    assert.equal(search.includes("dueTo="), false);
    assert.equal(search.includes("aging="), false);

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.discovery.invoiceQueue, "overdue");
    assert.equal(parsed.discovery.agingBucket, "");
    assert.equal(parsed.discovery.invoiceFilters.status, "Issued");
    assert.equal(parsed.discovery.invoiceFilters.dueToDate, "");
  });

  it("round-trips collections aging bucket with overdue queue", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const discovery = {
      ...overdueIssuedInvoicesDiscovery(),
      agingBucket: "8-30" as const
    };
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: "b1111111-1111-1111-1111-111111111111",
      discovery
    });
    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Issued&queue=overdue&aging=8-30&invoiceId=b1111111-1111-1111-1111-111111111111"
    );
    const parsed = parseUrlSearch(search);
    assert.equal(parsed.discovery.invoiceQueue, "overdue");
    assert.equal(parsed.discovery.agingBucket, "8-30");
    assert.equal(parsed.invoiceId, "b1111111-1111-1111-1111-111111111111");
  });

  it("invalid aging bucket normalizes to all overdue", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&aging=paid"
    );
    assert.equal(parsed.discovery.invoiceQueue, "overdue");
    assert.equal(parsed.discovery.agingBucket, "");
  });

  it("aging without overdue queue is ignored", () => {
    const parsed = parseUrlSearch("?view=invoices&status=Issued&aging=1-7");
    assert.equal(parsed.discovery.invoiceQueue, "");
    assert.equal(parsed.discovery.agingBucket, "");
  });

  it("overdue queue coexists with counterparty filter and invoice detail deep-link", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const invoiceId = "b1111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId,
      discovery: {
        page: 1,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          status: "Issued",
          counterpartyReference: "acme-ua",
          dueToDate: "2026-01-01"
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: "overdue",
        agingBucket: ""
      }
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&counterpartyReference=acme-ua&status=Issued&queue=overdue&invoiceId=b1111111-1111-1111-1111-111111111111"
    );
    assert.equal(search.includes("dueTo="), false);

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.discovery.invoiceQueue, "overdue");
    assert.equal(parsed.discovery.agingBucket, "");
    assert.equal(parsed.discovery.invoiceFilters.counterpartyReference, "acme-ua");
    assert.equal(parsed.invoiceId, invoiceId);
  });

  it("queue=overdue without status still restores Issued overdue queue", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&queue=overdue"
    );
    assert.equal(parsed.discovery.invoiceQueue, "overdue");
    assert.equal(parsed.discovery.invoiceFilters.status, "Issued");
  });

  it("unknown queue values are ignored", () => {
    const parsed = parseUrlSearch("?view=invoices&status=Issued&queue=paid");
    assert.equal(parsed.discovery.invoiceQueue, "");
    assert.equal(parsed.discovery.invoiceFilters.status, "Issued");
  });

  it("clearing overdue queue means issued discovery without queue marker", () => {
    const overdue = overdueIssuedInvoicesDiscovery();
    const cleared = issuedInvoicesDiscovery();
    assert.equal(overdue.invoiceQueue, "overdue");
    assert.equal(cleared.invoiceQueue, "");
    assert.equal(cleared.invoiceFilters.status, "Issued");
    assert.equal(
      buildUrlSearch({
        view: "invoices",
        workspaceId: null,
        accrualId: null,
        invoiceId: null,
        discovery: cleared
      }),
      "?view=invoices&status=Issued"
    );
  });

  it("serializes promise follow-ups panel, group filter, and search in URL", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery: {
        page: 1,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          status: "Issued"
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: "overdue",
        agingBucket: "",
        collectionPanel: "followups",
        promiseGroup: "broken",
        promiseSearch: "acme"
      }
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Issued&queue=overdue&panel=followups&promiseGroup=broken&promiseQ=acme"
    );
  });

  it("restores promise follow-ups panel state from URL", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&panel=followups&promiseGroup=due_today&promiseQ=INV-9"
    );
    assert.equal(parsed.discovery.invoiceQueue, "overdue");
    assert.equal(parsed.discovery.collectionPanel, "followups");
    assert.equal(parsed.discovery.promiseGroup, "due_today");
    assert.equal(parsed.discovery.promiseSearch, "INV-9");
  });

  it("preserves follow-ups filters when opening and closing invoice detail", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const invoiceId = "b1111111-1111-1111-1111-111111111111";
    const base = {
      view: "invoices" as const,
      workspaceId,
      accrualId: null as string | null,
      invoiceId: null as string | null,
      discovery: {
        page: 1,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          status: "Issued" as const
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: "overdue" as const,
        agingBucket: "" as const,
        collectionPanel: "followups" as const,
        promiseGroup: "upcoming" as const,
        promiseSearch: "beta"
      }
    };

    const opened = withInvoiceId(base, invoiceId);
    const openedSearch = buildUrlSearch(opened);
    assert.match(openedSearch, /panel=followups/);
    assert.match(openedSearch, /promiseGroup=upcoming/);
    assert.match(openedSearch, /promiseQ=beta/);
    assert.match(openedSearch, new RegExp(`invoiceId=${invoiceId}`));

    const closed = withoutInvoiceId(opened);
    const closedSearch = buildUrlSearch(closed);
    assert.equal(closedSearch.includes("invoiceId"), false);
    assert.match(closedSearch, /panel=followups/);
    assert.match(closedSearch, /promiseGroup=upcoming/);
    assert.match(closedSearch, /promiseQ=beta/);

    const restored = parseUrlSearch(closedSearch);
    assert.equal(restored.discovery.collectionPanel, "followups");
    assert.equal(restored.discovery.promiseGroup, "upcoming");
    assert.equal(restored.discovery.promiseSearch, "beta");
    assert.equal(restored.invoiceId, null);
  });

  it("ignores promise follow-up params outside overdue followups panel", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&promiseGroup=broken&promiseQ=x"
    );
    assert.equal(parsed.discovery.collectionPanel, "");
    assert.equal(parsed.discovery.promiseGroup, "");
    assert.equal(parsed.discovery.promiseSearch, "");

    const withoutQueue = parseUrlSearch(
      "?view=invoices&status=Issued&panel=followups&promiseGroup=broken"
    );
    assert.equal(withoutQueue.discovery.collectionPanel, "");
    assert.equal(withoutQueue.discovery.promiseGroup, "");
  });

  it("unknown promiseGroup values are ignored", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&panel=followups&promiseGroup=paid"
    );
    assert.equal(parsed.discovery.collectionPanel, "followups");
    assert.equal(parsed.discovery.promiseGroup, "");
  });

  it("serializes collection workbench panel, section, sort, search, and hide completed", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId: null,
      discovery: {
        page: 1,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          status: "Issued"
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: "overdue",
        agingBucket: "",
        collectionPanel: "workbench",
        promiseGroup: "",
        promiseSearch: "acme",
        workbenchSection: "broken",
        workbenchSort: "amount_desc",
        workbenchHideCompleted: true
      }
    });

    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&status=Issued&queue=overdue&panel=workbench&wbSection=broken&promiseQ=acme&wbSort=amount_desc&wbHideCompleted=1"
    );
  });

  it("restores collection workbench state from URL and preserves it across detail open/close", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const invoiceId = "b1111111-1111-1111-1111-111111111111";
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&panel=workbench&wbSection=due_today&promiseQ=INV&wbSort=customer_asc&wbHideCompleted=1"
    );
    assert.equal(parsed.discovery.collectionPanel, "workbench");
    assert.equal(parsed.discovery.workbenchSection, "due_today");
    assert.equal(parsed.discovery.promiseSearch, "INV");
    assert.equal(parsed.discovery.workbenchSort, "customer_asc");
    assert.equal(parsed.discovery.workbenchHideCompleted, true);

    const base = {
      view: "invoices" as const,
      workspaceId,
      accrualId: null as string | null,
      invoiceId: null as string | null,
      discovery: parsed.discovery
    };
    const opened = withInvoiceId(base, invoiceId);
    const openedSearch = buildUrlSearch(opened);
    assert.match(openedSearch, /panel=workbench/);
    assert.match(openedSearch, /wbSection=due_today/);
    assert.match(openedSearch, /wbHideCompleted=1/);
    assert.match(openedSearch, new RegExp(`invoiceId=${invoiceId}`));

    const closed = withoutInvoiceId(opened);
    const restored = parseUrlSearch(buildUrlSearch(closed));
    assert.equal(restored.discovery.collectionPanel, "workbench");
    assert.equal(restored.discovery.workbenchSection, "due_today");
    assert.equal(restored.discovery.workbenchHideCompleted, true);
    assert.equal(restored.invoiceId, null);
  });

  it("ignores workbench params outside workbench panel", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&wbSection=broken&wbHideCompleted=1"
    );
    assert.equal(parsed.discovery.collectionPanel, "");
    assert.equal(parsed.discovery.workbenchSection, "");
    assert.equal(parsed.discovery.workbenchHideCompleted, false);
  });

  it("serializes and restores case history panel URL state with invoice detail", () => {
    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const invoiceId = "b1111111-1111-1111-1111-111111111111";
    const search = buildUrlSearch({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId,
      discovery: {
        page: 1,
        invoiceFilters: {
          ...EMPTY_INVOICE_FILTERS,
          status: "Issued"
        },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: "overdue",
        agingBucket: "",
        collectionPanel: "workbench",
        promiseGroup: "",
        promiseSearch: "",
        workbenchSection: "broken",
        workbenchSort: "priority",
        workbenchHideCompleted: false,
        caseHistoryOpen: true,
        caseHistoryType: "contacted",
        caseHistorySearch: "alpha",
        caseHistoryExpanded: true
      }
    });
    assert.match(search, /caseHistory=1/);
    assert.match(search, /historyType=contacted/);
    assert.match(search, /historyQ=alpha/);
    assert.match(search, /historyExpanded=1/);
    assert.match(search, /panel=workbench/);

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.discovery.caseHistoryOpen, true);
    assert.equal(parsed.discovery.caseHistoryType, "contacted");
    assert.equal(parsed.discovery.caseHistorySearch, "alpha");
    assert.equal(parsed.discovery.caseHistoryExpanded, true);

    const closed = withoutInvoiceId({
      view: "invoices",
      workspaceId,
      accrualId: null,
      invoiceId,
      discovery: parsed.discovery
    });
    const closedSearch = buildUrlSearch(closed);
    assert.equal(closedSearch.includes("caseHistory"), false);
    assert.equal(closedSearch.includes("historyType"), false);
  });

  it("ignores case history params without invoice detail", () => {
    const parsed = parseUrlSearch(
      "?view=invoices&status=Issued&queue=overdue&caseHistory=1&historyType=paid"
    );
    assert.equal(parsed.discovery.caseHistoryOpen, false);
    assert.equal(parsed.discovery.caseHistoryType, "");
  });

  it("round-trips disputed and escalated promise groups", () => {
    for (const group of ["disputed", "escalated"] as const) {
      const search = buildUrlSearch({
        view: "invoices",
        workspaceId: "11111111-1111-1111-1111-111111111111",
        accrualId: null,
        invoiceId: null,
        discovery: {
          page: 1,
          invoiceFilters: {
            ...EMPTY_INVOICE_FILTERS,
            status: "Issued"
          },
          accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
          invoiceQueue: "overdue",
          agingBucket: "",
          collectionPanel: "followups",
          promiseGroup: group,
          promiseSearch: ""
        }
      });
      assert.match(search, new RegExp(`promiseGroup=${group}`));
      assert.equal(parseUrlSearch(search).discovery.promiseGroup, group);
    }
  });
});

describe("accrual detail deep-link URL policy", () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const accrualId = "a1111111-1111-1111-1111-111111111111";
  const otherAccrualId = "a2222222-2222-2222-2222-222222222222";

  const baseAccrualsState = {
    view: "accruals" as const,
    workspaceId,
    accrualId: null as string | null,
    invoiceId: null as string | null,
    discovery: {
      page: 2,
      invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
      accrualFilters: {
        descriptionPrefix: "Rent",
        status: "Draft" as const,
        recognitionFromDate: "2026-07-01",
        recognitionToDate: "2026-07-31"
      },
      invoiceQueue: "" as const
    }
  };

  it("open detail adds accrualId and preserves filters/page", () => {
    const opened = withAccrualId(baseAccrualsState, accrualId);
    const search = buildUrlSearch(opened);
    assert.equal(
      search,
      "?view=accruals&workspaceId=11111111-1111-1111-1111-111111111111&descriptionPrefix=Rent&status=Draft&recognitionFrom=2026-07-01&recognitionTo=2026-07-31&page=2&accrualId=a1111111-1111-1111-1111-111111111111"
    );
    const parsed = parseUrlSearch(search);
    assert.equal(parsed.accrualId, accrualId);
    assert.equal(parsed.invoiceId, null);
    assert.equal(parsed.discovery.page, 2);
    assert.equal(parsed.discovery.accrualFilters.status, "Draft");
    assert.equal(parsed.discovery.accrualFilters.descriptionPrefix, "Rent");
  });

  it("close detail removes only accrualId", () => {
    const opened = withAccrualId(baseAccrualsState, accrualId);
    const closed = withoutAccrualId(opened);
    const search = buildUrlSearch(closed);
    assert.equal(search.includes("accrualId"), false);
    assert.equal(
      search,
      "?view=accruals&workspaceId=11111111-1111-1111-1111-111111111111&descriptionPrefix=Rent&status=Draft&recognitionFrom=2026-07-01&recognitionTo=2026-07-31&page=2"
    );
  });

  it("initial URL with accrualId restores deep link without requiring list presence", () => {
    const parsed = parseUrlSearch(
      `?view=accruals&workspaceId=${workspaceId}&status=Recognized&page=3&accrualId=${accrualId}`
    );
    assert.equal(parsed.accrualId, accrualId);
    assert.equal(parsed.discovery.page, 3);
    assert.equal(parsed.discovery.accrualFilters.status, "Recognized");
  });

  it("switching accrualId updates only the deep-link target", () => {
    const first = withAccrualId(baseAccrualsState, accrualId);
    const second = withAccrualId(first, otherAccrualId);
    const search = buildUrlSearch(second);
    assert.match(search, new RegExp(`accrualId=${otherAccrualId}`));
    assert.equal(search.includes(accrualId), false);
    assert.equal(parseUrlSearch(search).discovery.accrualFilters.status, "Draft");
  });

  it("invalid GUID accrualId does not become a detail target", () => {
    assert.equal(parseAccrualIdParam("not-a-guid"), null);
    assert.equal(parseAccrualIdParam(""), null);
    assert.equal(parseAccrualIdParam("   "), null);
    const parsed = parseUrlSearch(
      "?view=accruals&status=Draft&accrualId=not-a-guid&page=2"
    );
    assert.equal(parsed.accrualId, null);
    assert.equal(parsed.discovery.page, 2);
    assert.equal(parsed.discovery.accrualFilters.status, "Draft");
    const normalized = buildUrlSearch(parsed);
    assert.equal(normalized.includes("accrualId"), false);
    assert.match(normalized, /status=Draft/);
    assert.match(normalized, /page=2/);
  });

  it("omits accrualId outside accruals view even if present in state", () => {
    const search = buildUrlSearch({
      view: "dashboard",
      workspaceId,
      accrualId,
      invoiceId: null,
      discovery: baseAccrualsState.discovery
    });
    assert.equal(search.includes("accrualId"), false);
  });

  it("ignores accrualId query when view is not accruals", () => {
    const parsed = parseUrlSearch(
      `?view=invoices&status=Draft&accrualId=${accrualId}`
    );
    assert.equal(parsed.view, "invoices");
    assert.equal(parsed.accrualId, null);
  });

  it("mutation coordination keeps accrualId when filters stay put", () => {
    const before = withAccrualId(baseAccrualsState, accrualId);
    const afterLifecycle = {
      ...before,
      discovery: {
        ...before.discovery,
        accrualFilters: {
          ...before.discovery.accrualFilters,
          status: "Draft" as const
        }
      }
    };
    assert.equal(afterLifecycle.accrualId, accrualId);
    assert.match(buildUrlSearch(afterLifecycle), new RegExp(`accrualId=${accrualId}`));
  });

  it("back/forward search pairs differ only by accrualId (no loop helpers)", () => {
    const listOnly = buildUrlSearch(baseAccrualsState);
    const withDetail = buildUrlSearch(withAccrualId(baseAccrualsState, accrualId));
    assert.notEqual(listOnly, withDetail);
    assert.equal(
      buildUrlSearch(withoutAccrualId(withAccrualId(baseAccrualsState, accrualId))),
      listOnly
    );
  });
});

describe("invoice detail deep-link URL policy", () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const invoiceId = "b1111111-1111-1111-1111-111111111111";
  const otherInvoiceId = "b2222222-2222-2222-2222-222222222222";
  const accrualId = "a1111111-1111-1111-1111-111111111111";

  const baseInvoicesState = {
    view: "invoices" as const,
    workspaceId,
    accrualId: null as string | null,
    invoiceId: null as string | null,
    discovery: {
      page: 2,
      invoiceFilters: {
        documentNumber: "INV-9",
        status: "Draft" as const,
        createdFromDate: "2026-07-01",
        createdToDate: "2026-07-31"
      },
      accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
      invoiceQueue: "" as const
    }
  };

  it("parses valid invoiceId GUID", () => {
    assert.equal(parseInvoiceIdParam(invoiceId), invoiceId);
    const parsed = parseUrlSearch(
      `?view=invoices&workspaceId=${workspaceId}&status=Draft&page=2&invoiceId=${invoiceId}`
    );
    assert.equal(parsed.invoiceId, invoiceId);
    assert.equal(parsed.discovery.page, 2);
    assert.equal(parsed.discovery.invoiceFilters.status, "Draft");
  });

  it("invalid GUID invoiceId normalizes to null", () => {
    assert.equal(parseInvoiceIdParam("not-a-guid"), null);
    const parsed = parseUrlSearch(
      "?view=invoices&status=Draft&invoiceId=not-a-guid&page=2"
    );
    assert.equal(parsed.invoiceId, null);
    assert.equal(parsed.discovery.page, 2);
    assert.equal(buildUrlSearch(parsed).includes("invoiceId"), false);
  });

  it("open adds only invoiceId and preserves invoice filters", () => {
    const opened = withInvoiceId(baseInvoicesState, invoiceId);
    const search = buildUrlSearch(opened);
    assert.equal(
      search,
      "?view=invoices&workspaceId=11111111-1111-1111-1111-111111111111&documentNumber=INV-9&status=Draft&createdFrom=2026-07-01&createdTo=2026-07-31&page=2&invoiceId=b1111111-1111-1111-1111-111111111111"
    );
  });

  it("close removes only invoiceId", () => {
    const closed = withoutInvoiceId(withInvoiceId(baseInvoicesState, invoiceId));
    const search = buildUrlSearch(closed);
    assert.equal(search.includes("invoiceId"), false);
    assert.match(search, /documentNumber=INV-9/);
    assert.match(search, /status=Draft/);
    assert.match(search, /page=2/);
  });

  it("view normalization isolates invoiceId and accrualId", () => {
    const accrualView = parseUrlSearch(
      `?view=accruals&accrualId=${accrualId}&invoiceId=${invoiceId}&status=Draft`
    );
    assert.equal(accrualView.accrualId, accrualId);
    assert.equal(accrualView.invoiceId, null);

    const invoiceView = parseUrlSearch(
      `?view=invoices&accrualId=${accrualId}&invoiceId=${invoiceId}&status=Draft`
    );
    assert.equal(invoiceView.invoiceId, invoiceId);
    assert.equal(invoiceView.accrualId, null);

    assert.equal(
      buildUrlSearch({
        ...baseInvoicesState,
        invoiceId,
        accrualId
      }).includes("accrualId"),
      false
    );
  });

  it("round-trips invoice deep-link with filters", () => {
    const search = buildUrlSearch(withInvoiceId(baseInvoicesState, invoiceId));
    const parsed = parseUrlSearch(search);
    assert.equal(parsed.invoiceId, invoiceId);
    assert.equal(parsed.discovery.invoiceFilters.documentNumber, "INV-9");
    assert.equal(buildUrlSearch(parsed), search);
  });

  it("switching invoiceId updates only the deep-link target", () => {
    const search = buildUrlSearch(
      withInvoiceId(withInvoiceId(baseInvoicesState, invoiceId), otherInvoiceId)
    );
    assert.match(search, new RegExp(`invoiceId=${otherInvoiceId}`));
    assert.equal(search.includes(invoiceId), false);
  });

  it("back/forward search pairs differ only by invoiceId (no loop helpers)", () => {
    const listOnly = buildUrlSearch(baseInvoicesState);
    const withDetail = buildUrlSearch(withInvoiceId(baseInvoicesState, invoiceId));
    assert.notEqual(listOnly, withDetail);
    assert.equal(
      buildUrlSearch(withoutInvoiceId(withInvoiceId(baseInvoicesState, invoiceId))),
      listOnly
    );
  });
});

describe("accrual → invoice reverse-link URL handoff", () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const accrualId = "a1111111-1111-1111-1111-111111111111";
  const invoiceId = "b1111111-1111-1111-1111-111111111111";

  it("handoff target is invoices view with invoiceId and without accrualId", () => {
    const afterHandoff = {
      view: "invoices" as const,
      workspaceId,
      accrualId: null,
      invoiceId,
      discovery: {
        page: 1,
        invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: ""
      }
    };

    const search = buildUrlSearch(afterHandoff);
    assert.match(search, /view=invoices/);
    assert.match(search, new RegExp(`invoiceId=${invoiceId}`));
    assert.equal(search.includes("accrualId"), false);

    const parsed = parseUrlSearch(search);
    assert.equal(parsed.view, "invoices");
    assert.equal(parsed.invoiceId, invoiceId);
    assert.equal(parsed.accrualId, null);
  });

  it("return via related accrual restores accruals view with accrualId", () => {
    const returnState = {
      view: "accruals" as const,
      workspaceId,
      accrualId,
      invoiceId: null,
      discovery: {
        page: 1,
        invoiceFilters: { ...EMPTY_INVOICE_FILTERS },
        accrualFilters: { ...EMPTY_ACCRUAL_FILTERS },
        invoiceQueue: ""
      }
    };

    const search = buildUrlSearch(returnState);
    assert.match(search, /view=accruals/);
    assert.match(search, new RegExp(`accrualId=${accrualId}`));
    assert.equal(search.includes("invoiceId"), false);
  });
});
