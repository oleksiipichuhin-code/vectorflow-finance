import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function accrualJson(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1111111-1111-1111-1111-111111111111",
    financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
    type: "Revenue",
    amount: 100,
    currency: "UAH",
    recognitionDateUtc: "2026-07-01T00:00:00.000Z",
    description: "Created",
    sourceInvoiceId: null,
    status: "Draft",
    createdAtUtc: "2026-07-01T00:00:00.000Z",
    updatedAtUtc: "2026-07-01T00:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

describe("createAccrual Source Invoice contract", () => {
  it("POSTs create with sourceInvoiceId null when none selected", async () => {
    const { createAccrual } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(accrualJson()), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await createAccrual("w1111111-1111-1111-1111-111111111111", {
      type: "Revenue",
      amount: 100,
      currency: "UAH",
      recognitionDateUtc: "2026-07-01T00:00:00.000Z",
      description: "Created",
      sourceInvoiceId: null
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/accruals$/);
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(
      calls[0]!.init?.body,
      JSON.stringify({
        type: "Revenue",
        amount: 100,
        currency: "UAH",
        recognitionDateUtc: "2026-07-01T00:00:00.000Z",
        description: "Created",
        sourceInvoiceId: null
      })
    );
    assert.equal(result.sourceInvoiceId, null);
  });

  it("POSTs create with selected sourceInvoiceId and does not require a follow-up mutation", async () => {
    const { createAccrual } = await import("./api.ts");
    const invoiceId = "i1111111-1111-1111-1111-111111111111";
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(accrualJson({ sourceInvoiceId: invoiceId })), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await createAccrual("w1111111-1111-1111-1111-111111111111", {
      type: "Revenue",
      amount: 100,
      currency: "UAH",
      recognitionDateUtc: "2026-07-01T00:00:00.000Z",
      description: "Created",
      sourceInvoiceId: invoiceId
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/accruals$/);
    assert.ok(!calls.some((call) => call.url.includes("change-source-invoice")));
    const body = JSON.parse(String(calls[0]!.init?.body)) as { sourceInvoiceId: string };
    assert.equal(body.sourceInvoiceId, invoiceId);
    assert.equal(result.sourceInvoiceId, invoiceId);
  });

  it("maps Invoice NotFound JSON body to FinanceApiRequestError (not success)", async () => {
    const { createAccrual, FinanceApiRequestError } = await import("./api.ts");
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
        createAccrual("w1111111-1111-1111-1111-111111111111", {
          type: "Revenue",
          amount: 100,
          currency: "UAH",
          recognitionDateUtc: "2026-07-01T00:00:00.000Z",
          description: "Created",
          sourceInvoiceId: "i1111111-1111-1111-1111-111111111111"
        }),
      (error: unknown) => {
        assert.ok(error instanceof FinanceApiRequestError);
        assert.equal(error.status, 404);
        assert.equal(error.errorKind, "NotFound");
        assert.match(error.message, /Invoice/);
        return true;
      }
    );
  });
});
