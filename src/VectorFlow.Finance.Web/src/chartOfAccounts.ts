import type { AccountType, FinancialAccount } from "./api.ts";

export type AccountStatusFilter = "" | "Active" | "Archived";
export type AccountTypeFilter = "" | AccountType;

export type ChartOfAccountsFilters = {
  query: string;
  status: AccountStatusFilter;
  type: AccountTypeFilter;
};

export const EMPTY_CHART_OF_ACCOUNTS_FILTERS: ChartOfAccountsFilters = {
  query: "",
  status: "",
  type: ""
};

export const ACCOUNT_TYPE_OPTIONS: ReadonlyArray<{ id: AccountType; label: string }> = [
  { id: "Asset", label: "Asset" },
  { id: "Liability", label: "Liability" },
  { id: "Equity", label: "Equity" },
  { id: "Revenue", label: "Revenue" },
  { id: "Expense", label: "Expense" }
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAccountId(value: string | null | undefined): boolean {
  if (value == null) {
    return false;
  }

  const trimmed = value.trim();
  return UUID_RE.test(trimmed);
}

export function parseAccountStatusFilter(
  value: string | null | undefined
): AccountStatusFilter {
  if (value == null) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed === "Active" || trimmed === "Archived") {
    return trimmed;
  }

  return "";
}

export function parseAccountTypeFilter(
  value: string | null | undefined
): AccountTypeFilter {
  if (value == null) {
    return "";
  }

  const trimmed = value.trim();
  if (
    trimmed === "Asset" ||
    trimmed === "Liability" ||
    trimmed === "Equity" ||
    trimmed === "Revenue" ||
    trimmed === "Expense"
  ) {
    return trimmed;
  }

  return "";
}

export function hasActiveChartOfAccountsFilters(filters: ChartOfAccountsFilters): boolean {
  return Boolean(
    filters.query.trim() || filters.status || filters.type
  );
}

/**
 * Client-side filter over workspace chart-of-accounts accounts.
 * Matches case-insensitive code/name substring plus exact status/type.
 */
export function filterChartOfAccounts(
  accounts: ReadonlyArray<FinancialAccount>,
  filters: ChartOfAccountsFilters
): FinancialAccount[] {
  const query = filters.query.trim().toLowerCase();
  const status = filters.status;
  const type = filters.type;

  return accounts.filter((account) => {
    if (status && account.status !== status) {
      return false;
    }

    if (type && account.type !== type) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      account.code.toLowerCase().includes(query) ||
      account.name.toLowerCase().includes(query)
    );
  });
}

export function formatAccountLabel(account: FinancialAccount): string {
  return `${account.code} — ${account.name}`;
}
