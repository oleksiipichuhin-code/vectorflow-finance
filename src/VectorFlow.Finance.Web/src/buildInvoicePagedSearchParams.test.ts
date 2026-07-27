import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInvoicePagedSearchParams } from "./api.ts";

describe("buildInvoicePagedSearchParams", () => {
  it("includes dueFromUtc and dueToUtc when provided", () => {
    const params = buildInvoicePagedSearchParams({
      page: 1,
      pageSize: 5,
      status: "Issued",
      dueFromUtc: "2026-08-01T00:00:00.000Z",
      dueToUtc: "2026-08-31T23:59:59.999Z"
    });

    assert.equal(params.get("page"), "1");
    assert.equal(params.get("pageSize"), "5");
    assert.equal(params.get("status"), "Issued");
    assert.equal(params.get("dueFromUtc"), "2026-08-01T00:00:00.000Z");
    assert.equal(params.get("dueToUtc"), "2026-08-31T23:59:59.999Z");
  });

  it("omits due bounds when unset", () => {
    const params = buildInvoicePagedSearchParams({
      page: 2,
      pageSize: 5,
      documentNumber: "INV-1",
      createdFromUtc: "2026-07-01T00:00:00.000Z"
    });

    assert.equal(params.get("documentNumber"), "INV-1");
    assert.equal(params.get("createdFromUtc"), "2026-07-01T00:00:00.000Z");
    assert.equal(params.has("dueFromUtc"), false);
    assert.equal(params.has("dueToUtc"), false);
  });
});
