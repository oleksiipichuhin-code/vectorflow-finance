import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountCacheKey,
  formatAccountOption,
  loadAccountCache,
  rememberAccount,
  toCachedAccount
} from "./journalAccounts.ts";

describe("journalAccounts cache", () => {
  it("remembers accounts by workspace and dedupes by id", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      }
    };

    const workspaceId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const first = rememberAccount(
      workspaceId,
      {
        id: "11111111-1111-1111-1111-111111111111",
        financeWorkspaceId: workspaceId,
        code: "1000",
        name: "Cash",
        type: "Asset",
        status: "Active",
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T00:00:00Z",
        archivedAt: null
      },
      storage
    );
    assert.equal(first.length, 1);
    assert.equal(first[0]?.code, "1000");

    const second = rememberAccount(
      workspaceId,
      {
        id: "11111111-1111-1111-1111-111111111111",
        financeWorkspaceId: workspaceId,
        code: "1000",
        name: "Cash renamed",
        type: "Asset",
        status: "Active",
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T01:00:00Z",
        archivedAt: null
      },
      storage
    );
    assert.equal(second.length, 1);
    assert.equal(second[0]?.name, "Cash renamed");

    rememberAccount(
      workspaceId,
      toCachedAccount({
        id: "22222222-2222-2222-2222-222222222222",
        financeWorkspaceId: workspaceId,
        code: "4000",
        name: "Revenue",
        type: "Revenue",
        status: "Active",
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T00:00:00Z",
        archivedAt: null
      }),
      storage
    );

    const loaded = loadAccountCache(workspaceId, storage);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0]?.code, "4000");
    assert.match(accountCacheKey(workspaceId), /aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/);
    assert.equal(
      formatAccountOption(loaded[0]!),
      "4000 · Revenue (Revenue)"
    );
  });
});
