import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function invoiceJson(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    documentNumber: "INV-HDR-1",
    counterpartyReference: "cp-1",
    currency: "UAH",
    status: "Draft",
    totalAmount: 100,
    dueDateUtc: "2026-08-01T00:00:00.000Z",
    issuedAtUtc: null,
    createdAtUtc: "2026-07-01T00:00:00.000Z",
    updatedAtUtc: "2026-07-02T00:00:00.000Z",
    lines: [],
    ...overrides
  };
}

describe("draft invoice header change API clients", () => {
  it("POSTs documentNumber to change-document-number", async () => {
    const { changeInvoiceDocumentNumber } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(invoiceJson({ documentNumber: "INV-HDR-2" })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await changeInvoiceDocumentNumber(
      "w1111111-1111-1111-1111-111111111111",
      "b1111111-1111-1111-1111-111111111111",
      "INV-HDR-2"
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/change-document-number$/);
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(calls[0]!.init?.body, JSON.stringify({ documentNumber: "INV-HDR-2" }));
    assert.equal(result.documentNumber, "INV-HDR-2");
  });

  it("POSTs counterpartyReference to change-counterparty", async () => {
    const { changeInvoiceCounterparty } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(invoiceJson({ counterpartyReference: "cp-9" })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await changeInvoiceCounterparty(
      "w1111111-1111-1111-1111-111111111111",
      "b1111111-1111-1111-1111-111111111111",
      "cp-9"
    );

    assert.match(calls[0]!.url, /\/change-counterparty$/);
    assert.equal(
      calls[0]!.init?.body,
      JSON.stringify({ counterpartyReference: "cp-9" })
    );
    assert.equal(result.counterpartyReference, "cp-9");
  });

  it("POSTs currency to change-currency", async () => {
    const { changeInvoiceCurrency } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(invoiceJson({ currency: "USD" })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await changeInvoiceCurrency(
      "w1111111-1111-1111-1111-111111111111",
      "b1111111-1111-1111-1111-111111111111",
      "USD"
    );

    assert.match(calls[0]!.url, /\/change-currency$/);
    assert.equal(calls[0]!.init?.body, JSON.stringify({ currency: "USD" }));
    assert.equal(result.currency, "USD");
  });

  it("maps Conflict JSON body to FinanceApiRequestError for change-document-number", async () => {
    const { changeInvoiceDocumentNumber, FinanceApiRequestError } = await import("./api.ts");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "Conflict",
          message: "The invoice was modified by another request. Reload and retry."
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        changeInvoiceDocumentNumber(
          "w1111111-1111-1111-1111-111111111111",
          "b1111111-1111-1111-1111-111111111111",
          "INV-X"
        ),
      (error: unknown) => {
        assert.ok(error instanceof FinanceApiRequestError);
        assert.equal(error.status, 409);
        assert.equal(error.errorKind, "Conflict");
        return true;
      }
    );
  });
});
