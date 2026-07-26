import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("changeAccrualAmount", () => {
  it("POSTs amount to change-amount and returns Accrual", async () => {
    const { changeAccrualAmount } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          id: "a1111111-1111-1111-1111-111111111111",
          financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
          type: "Revenue",
          amount: 250.75,
          currency: "UAH",
          recognitionDateUtc: "2026-07-01T00:00:00.000Z",
          description: "Edited",
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

    const result = await changeAccrualAmount(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      250.75
    );

    assert.equal(calls.length, 1);
    assert.match(
      calls[0]!.url,
      /\/api\/finance-workspaces\/w1111111-1111-1111-1111-111111111111\/accruals\/a1111111-1111-1111-1111-111111111111\/change-amount$/
    );
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(calls[0]!.init?.body, JSON.stringify({ amount: 250.75 }));
    assert.equal(result.amount, 250.75);
    assert.equal(result.status, "Draft");
  });

  it("maps non-success JSON body to FinanceApiRequestError", async () => {
    const { changeAccrualAmount, FinanceApiRequestError } = await import("./api.ts");
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
        changeAccrualAmount(
          "w1111111-1111-1111-1111-111111111111",
          "a1111111-1111-1111-1111-111111111111",
          10
        ),
      (error: unknown) => {
        assert.ok(error instanceof FinanceApiRequestError);
        assert.equal(error.status, 409);
        assert.equal(error.errorKind, "Conflict");
        assert.match(error.message, /modified by another request/);
        return true;
      }
    );
  });
});
