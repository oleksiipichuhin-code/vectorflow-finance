import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("listLedgerPostings / getLedgerPosting", () => {
  it("GETs workspace ledger list", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify([
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            financeWorkspaceId: "11111111-1111-1111-1111-111111111111",
            journalEntryId: "22222222-2222-2222-2222-222222222222",
            postedAtUtc: "2026-07-20T12:00:00.000Z",
            lines: [],
            totalDebit: 50,
            totalCredit: 50
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const { listLedgerPostings } = await import("./api.ts");
      const result = await listLedgerPostings("11111111-1111-1111-1111-111111111111");
      assert.equal(result.length, 1);
      assert.equal(result[0]!.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
      assert.match(calls[0]!.url, /\/ledger$/);
      assert.equal(calls[0]!.init?.method ?? "GET", "GET");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("GETs ledger posting by id", async () => {
    const calls: Array<{ url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push({ url: String(input) });
      return new Response(
        JSON.stringify({
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          financeWorkspaceId: "11111111-1111-1111-1111-111111111111",
          journalEntryId: "22222222-2222-2222-2222-222222222222",
          postedAtUtc: "2026-07-20T12:00:00.000Z",
          lines: [
            {
              id: "llllllll-llll-llll-llll-llllllllllll",
              sourceJournalEntryLineId: "ssssssss-ssss-ssss-ssss-ssssssssssss",
              financialAccountId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
              debit: 50,
              credit: 0,
              description: "Cash",
              sequence: 1
            }
          ],
          totalDebit: 50,
          totalCredit: 50
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      const { getLedgerPosting } = await import("./api.ts");
      const result = await getLedgerPosting(
        "11111111-1111-1111-1111-111111111111",
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
      );
      assert.equal(result.id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
      assert.equal(result.lines.length, 1);
      assert.match(
        calls[0]!.url,
        /\/ledger\/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa$/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
