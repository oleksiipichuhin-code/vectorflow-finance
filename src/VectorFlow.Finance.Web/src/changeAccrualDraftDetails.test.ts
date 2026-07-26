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
    description: "Edited",
    sourceInvoiceId: null,
    status: "Draft",
    createdAtUtc: "2026-07-01T00:00:00.000Z",
    updatedAtUtc: "2026-07-02T00:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

describe("draft accrual detail change API clients", () => {
  it("POSTs description to change-description", async () => {
    const { changeAccrualDescription } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(accrualJson({ description: "New description" })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await changeAccrualDescription(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      "New description"
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/change-description$/);
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(calls[0]!.init?.body, JSON.stringify({ description: "New description" }));
    assert.equal(result.description, "New description");
  });

  it("POSTs recognitionDateUtc to change-recognition-date", async () => {
    const { changeAccrualRecognitionDate } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify(accrualJson({ recognitionDateUtc: "2026-08-01T00:00:00.000Z" })),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await changeAccrualRecognitionDate(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      "2026-08-01T00:00:00.000Z"
    );

    assert.match(calls[0]!.url, /\/change-recognition-date$/);
    assert.equal(
      calls[0]!.init?.body,
      JSON.stringify({ recognitionDateUtc: "2026-08-01T00:00:00.000Z" })
    );
    assert.equal(result.recognitionDateUtc, "2026-08-01T00:00:00.000Z");
  });

  it("POSTs type to change-type", async () => {
    const { changeAccrualType } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(accrualJson({ type: "Expense" })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await changeAccrualType(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      "Expense"
    );

    assert.match(calls[0]!.url, /\/change-type$/);
    assert.equal(calls[0]!.init?.body, JSON.stringify({ type: "Expense" }));
    assert.equal(result.type, "Expense");
  });

  it("POSTs currency to change-currency", async () => {
    const { changeAccrualCurrency } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(accrualJson({ currency: "USD" })), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await changeAccrualCurrency(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      "USD"
    );

    assert.match(calls[0]!.url, /\/change-currency$/);
    assert.equal(calls[0]!.init?.body, JSON.stringify({ currency: "USD" }));
    assert.equal(result.currency, "USD");
  });

  it("maps Conflict JSON body to FinanceApiRequestError for change-description", async () => {
    const { changeAccrualDescription, FinanceApiRequestError } = await import("./api.ts");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "Conflict",
          message: "The accrual was modified by another request. Reload and retry."
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        changeAccrualDescription(
          "w1111111-1111-1111-1111-111111111111",
          "a1111111-1111-1111-1111-111111111111",
          "x"
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
