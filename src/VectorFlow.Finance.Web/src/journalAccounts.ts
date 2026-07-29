/**
 * Workspace-scoped account picker cache.
 * Accounts have no list HTTP endpoint yet; the shell remembers accounts created
 * or looked up during journal entry work so operators can reuse FinancialAccountId.
 */

import type { FinancialAccount } from "./api.ts";

export const ACCOUNT_CACHE_KEY_PREFIX = "vectorflow.finance.accountCache.";

export type CachedAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
};

export function accountCacheKey(workspaceId: string): string {
  return `${ACCOUNT_CACHE_KEY_PREFIX}${workspaceId.trim().toLowerCase()}`;
}

export function toCachedAccount(account: FinancialAccount): CachedAccount {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    status: account.status
  };
}

export function loadAccountCache(
  workspaceId: string,
  storage: Pick<Storage, "getItem"> | null | undefined = typeof localStorage !== "undefined"
    ? localStorage
    : null
): CachedAccount[] {
  if (!storage || !workspaceId.trim()) {
    return [];
  }

  try {
    const raw = storage.getItem(accountCacheKey(workspaceId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const row = item as Record<string, unknown>;
        if (
          typeof row.id !== "string" ||
          typeof row.code !== "string" ||
          typeof row.name !== "string" ||
          typeof row.type !== "string"
        ) {
          return null;
        }
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          type: row.type,
          status: typeof row.status === "string" ? row.status : "Active"
        } satisfies CachedAccount;
      })
      .filter((item): item is CachedAccount => item != null);
  } catch {
    return [];
  }
}

export function rememberAccount(
  workspaceId: string,
  account: FinancialAccount | CachedAccount,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined = typeof localStorage !==
  "undefined"
    ? localStorage
    : null
): CachedAccount[] {
  if (!storage || !workspaceId.trim()) {
    return [];
  }

  const cached =
    "financeWorkspaceId" in account ? toCachedAccount(account) : account;
  const existing = loadAccountCache(workspaceId, storage).filter(
    (item) => item.id.toLowerCase() !== cached.id.toLowerCase()
  );
  const next = [cached, ...existing];
  storage.setItem(accountCacheKey(workspaceId), JSON.stringify(next));
  return next;
}

export function formatAccountOption(account: CachedAccount): string {
  return `${account.code} · ${account.name} (${account.type})`;
}

export const ACCOUNT_TYPE_OPTIONS: ReadonlyArray<{
  id: AccountTypeOption;
  label: string;
}> = [
  { id: "Asset", label: "Asset" },
  { id: "Liability", label: "Liability" },
  { id: "Equity", label: "Equity" },
  { id: "Revenue", label: "Revenue" },
  { id: "Expense", label: "Expense" }
];

export type AccountTypeOption =
  | "Asset"
  | "Liability"
  | "Equity"
  | "Revenue"
  | "Expense";
