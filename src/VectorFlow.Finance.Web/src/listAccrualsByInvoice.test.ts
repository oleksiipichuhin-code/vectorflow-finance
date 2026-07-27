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
    description: "Linked",
    sourceInvoiceId: "i1111111-1111-1111-1111-111111111111",
    status: "Draft",
    createdAtUtc: "2026-07-01T00:00:00.000Z",
    updatedAtUtc: "2026-07-01T00:00:00.000Z",
    recognizedAtUtc: null,
    reversedAtUtc: null,
    reversalReason: null,
    ...overrides
  };
}

describe("listAccrualsByInvoice", () => {
  it("GETs workspace-scoped accruals by source invoice id", async () => {
    const { listAccrualsByInvoice } = await import("./api.ts");
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify([accrualJson()]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    const result = await listAccrualsByInvoice(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111"
    );

    assert.equal(calls.length, 1);
    assert.match(
      calls[0]!.url,
      /\/accruals\/by-invoice\/i1111111-1111-1111-1111-111111111111$/
    );
    assert.equal(calls[0]!.init?.method ?? "GET", "GET");
    assert.equal(result.length, 1);
    assert.equal(result[0]!.sourceInvoiceId, "i1111111-1111-1111-1111-111111111111");
  });

  it("returns empty array when none linked", async () => {
    const { listAccrualsByInvoice } = await import("./api.ts");
    globalThis.fetch = async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });

    const result = await listAccrualsByInvoice(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111"
    );
    assert.deepEqual(result, []);
  });

  it("passes AbortSignal to fetch when provided", async () => {
    const { listAccrualsByInvoice } = await import("./api.ts");
    const controller = new AbortController();
    let seen: AbortSignal | null | undefined;
    globalThis.fetch = async (_input, init) => {
      seen = init?.signal;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    };

    await listAccrualsByInvoice(
      "w1111111-1111-1111-1111-111111111111",
      "i1111111-1111-1111-1111-111111111111",
      controller.signal
    );
    assert.equal(seen, controller.signal);
  });
});
