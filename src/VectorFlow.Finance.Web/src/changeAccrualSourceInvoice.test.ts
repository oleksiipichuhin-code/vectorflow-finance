import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("changeAccrualSourceInvoice", () => {
  it("POSTs selected sourceInvoiceId to change-source-invoice", async () => {
    const { changeAccrualSourceInvoice } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          id: "a1111111-1111-1111-1111-111111111111",
          financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
          type: "Revenue",
          amount: 100,
          currency: "UAH",
          recognitionDateUtc: "2026-07-01T00:00:00.000Z",
          description: "Linked",
          sourceInvoiceId: "i1111111-1111-1111-1111-111111111111",
          status: "Draft",
          createdAtUtc: "2026-07-01T00:00:00.000Z",
          updatedAtUtc: "2026-07-02T00:00:00.000Z",
          recognizedAtUtc: null,
          reversedAtUtc: null,
          reversalReason: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await changeAccrualSourceInvoice(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111"
    );

    assert.equal(calls.length, 1);
    assert.match(
      calls[0]!.url,
      /\/api\/finance-workspaces\/w1111111-1111-1111-1111-111111111111\/accruals\/a1111111-1111-1111-1111-111111111111\/change-source-invoice$/
    );
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(
      calls[0]!.init?.body,
      JSON.stringify({ sourceInvoiceId: "i1111111-1111-1111-1111-111111111111" })
    );
    assert.equal(result.sourceInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("POSTs null body to clear source invoice", async () => {
    const { changeAccrualSourceInvoice } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          id: "a1111111-1111-1111-1111-111111111111",
          financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
          type: "Revenue",
          amount: 100,
          currency: "UAH",
          recognitionDateUtc: "2026-07-01T00:00:00.000Z",
          description: "Cleared",
          sourceInvoiceId: null,
          status: "Draft",
          createdAtUtc: "2026-07-01T00:00:00.000Z",
          updatedAtUtc: "2026-07-02T00:00:00.000Z",
          recognizedAtUtc: null,
          reversedAtUtc: null,
          reversalReason: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await changeAccrualSourceInvoice(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      null
    );

    assert.equal(calls[0]!.init?.body, JSON.stringify({ sourceInvoiceId: null }));
    assert.equal(result.sourceInvoiceId, null);
  });

  it("maps non-success JSON body to FinanceApiRequestError", async () => {
    const { changeAccrualSourceInvoice, FinanceApiRequestError } = await import("./api.ts");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "NotFound",
          message: "Invoice was not found."
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        changeAccrualSourceInvoice(
          "w1111111-1111-1111-1111-111111111111",
          "a1111111-1111-1111-1111-111111111111",
          "i1111111-1111-1111-1111-111111111111"
        ),
      (error: unknown) => {
        assert.ok(error instanceof FinanceApiRequestError);
        assert.equal(error.status, 404);
        assert.equal(error.errorKind, "NotFound");
        assert.match(error.message, /Invoice was not found/);
        return true;
      }
    );
  });
});

describe("getInvoice", () => {
  it("GETs workspace-scoped invoice by id", async () => {
    const { getInvoice } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          id: "i1111111-1111-1111-1111-111111111111",
          financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
          documentNumber: "INV-1",
          counterpartyReference: "cp",
          currency: "UAH",
          status: "Draft",
          dueDateUtc: null,
          totalAmount: 10,
          createdAtUtc: "2026-07-01T00:00:00.000Z",
          updatedAtUtc: "2026-07-01T00:00:00.000Z",
          issuedAtUtc: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const invoice = await getInvoice(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111"
    );

    assert.match(
      calls[0]!.url,
      /\/api\/finance-workspaces\/w1111111-1111-1111-1111-111111111111\/invoices\/i1111111-1111-1111-1111-111111111111$/
    );
    assert.equal(invoice.documentNumber, "INV-1");
  });
});
