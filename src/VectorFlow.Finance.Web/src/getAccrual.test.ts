import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("getAccrual", () => {
  it("GETs workspace-scoped accrual by id", async () => {
    const { getAccrual } = await import("./api.ts");
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
          description: "Loaded",
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

    const accrual = await getAccrual(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111"
    );

    assert.equal(calls.length, 1);
    assert.match(
      calls[0]!.url,
      /\/api\/finance-workspaces\/w1111111-1111-1111-1111-111111111111\/accruals\/a1111111-1111-1111-1111-111111111111$/
    );
    assert.equal(calls[0]!.init?.method, undefined);
    assert.equal(accrual.description, "Loaded");
    assert.equal(accrual.sourceInvoiceId, "i1111111-1111-1111-1111-111111111111");
    assert.equal(accrual.status, "Draft");
  });

  it("passes AbortSignal to fetch when provided", async () => {
    const { getAccrual } = await import("./api.ts");
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    globalThis.fetch = async (_input, init) => {
      seenSignal = init?.signal ?? undefined;
      return new Response(
        JSON.stringify({
          id: "a1111111-1111-1111-1111-111111111111",
          financeWorkspaceId: "w1111111-1111-1111-1111-111111111111",
          type: "Expense",
          amount: 10,
          currency: "UAH",
          recognitionDateUtc: "2026-07-01T00:00:00.000Z",
          description: "Abortable",
          sourceInvoiceId: null,
          status: "Recognized",
          createdAtUtc: "2026-07-01T00:00:00.000Z",
          updatedAtUtc: "2026-07-01T00:00:00.000Z",
          recognizedAtUtc: "2026-07-01T12:00:00.000Z",
          reversedAtUtc: null,
          reversalReason: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    await getAccrual(
      "w1111111-1111-1111-1111-111111111111",
      "a1111111-1111-1111-1111-111111111111",
      controller.signal
    );

    assert.equal(seenSignal, controller.signal);
  });

  it("maps Accrual NotFound JSON body to FinanceApiRequestError", async () => {
    const { getAccrual, FinanceApiRequestError } = await import("./api.ts");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "NotFound",
          message: "Accrual was not found."
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        getAccrual(
          "w1111111-1111-1111-1111-111111111111",
          "a1111111-1111-1111-1111-111111111111"
        ),
      (error: unknown) => {
        assert.ok(error instanceof FinanceApiRequestError);
        assert.equal(error.status, 404);
        assert.equal(error.errorKind, "NotFound");
        assert.match(error.message, /Accrual was not found/);
        return true;
      }
    );
  });

  it("maps unexpected 5xx to FinanceApiRequestError", async () => {
    const { getAccrual, FinanceApiRequestError } = await import("./api.ts");
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: "UnexpectedError",
          message: "Internal Server Error"
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );

    await assert.rejects(
      () =>
        getAccrual(
          "w1111111-1111-1111-1111-111111111111",
          "a1111111-1111-1111-1111-111111111111"
        ),
      (error: unknown) => {
        assert.ok(error instanceof FinanceApiRequestError);
        assert.equal(error.status, 500);
        return true;
      }
    );
  });
});
