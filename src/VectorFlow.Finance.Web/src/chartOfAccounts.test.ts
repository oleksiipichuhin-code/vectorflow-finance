import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FinancialAccount } from "./api.ts";
import {
  EMPTY_CHART_OF_ACCOUNTS_FILTERS,
  filterChartOfAccounts,
  formatAccountLabel,
  hasActiveChartOfAccountsFilters,
  parseAccountStatusFilter,
  parseAccountTypeFilter
} from "./chartOfAccounts.ts";

function account(
  overrides: Partial<FinancialAccount> & Pick<FinancialAccount, "id" | "code" | "name">
): FinancialAccount {
  return {
    financeWorkspaceId: "11111111-1111-1111-1111-111111111111",
    type: "Asset",
    status: "Active",
    createdAt: "2026-07-29T10:00:00Z",
    updatedAt: "2026-07-29T10:00:00Z",
    archivedAt: null,
    ...overrides
  };
}

describe("chartOfAccounts", () => {
  it("parses status and type filters", () => {
    assert.equal(parseAccountStatusFilter("Active"), "Active");
    assert.equal(parseAccountStatusFilter("Archived"), "Archived");
    assert.equal(parseAccountStatusFilter("Draft"), "");
    assert.equal(parseAccountTypeFilter("Revenue"), "Revenue");
    assert.equal(parseAccountTypeFilter("Cash"), "");
  });

  it("detects active filters", () => {
    assert.equal(hasActiveChartOfAccountsFilters(EMPTY_CHART_OF_ACCOUNTS_FILTERS), false);
    assert.equal(
      hasActiveChartOfAccountsFilters({ ...EMPTY_CHART_OF_ACCOUNTS_FILTERS, query: "cash" }),
      true
    );
    assert.equal(
      hasActiveChartOfAccountsFilters({ ...EMPTY_CHART_OF_ACCOUNTS_FILTERS, status: "Active" }),
      true
    );
  });

  it("filters by query, status, and type", () => {
    const accounts = [
      account({ id: "a1", code: "1010", name: "Operating Cash", type: "Asset" }),
      account({ id: "a2", code: "4010", name: "Sales Revenue", type: "Revenue" }),
      account({
        id: "a3",
        code: "5010",
        name: "Rent Expense",
        type: "Expense",
        status: "Archived",
        archivedAt: "2026-07-29T12:00:00Z"
      })
    ];

    assert.deepEqual(
      filterChartOfAccounts(accounts, { query: "cash", status: "", type: "" }).map((a) => a.id),
      ["a1"]
    );
    assert.deepEqual(
      filterChartOfAccounts(accounts, { query: "", status: "Archived", type: "" }).map((a) => a.id),
      ["a3"]
    );
    assert.deepEqual(
      filterChartOfAccounts(accounts, { query: "sales", status: "", type: "Revenue" }).map(
        (a) => a.id
      ),
      ["a2"]
    );
    assert.deepEqual(
      filterChartOfAccounts(accounts, { query: "zzz", status: "", type: "" }),
      []
    );
  });

  it("formats account labels", () => {
    assert.equal(
      formatAccountLabel(account({ id: "a1", code: "1010", name: "Cash" })),
      "1010 — Cash"
    );
  });
});
