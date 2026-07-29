export type AppView =
  | "dashboard"
  | "workspace"
  | "invoices"
  | "accruals"
  | "journals"
  | "ledger"
  | "trial-balance"
  | "account-statement";

export const APP_VIEWS: ReadonlyArray<{ id: AppView; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "workspace", label: "Workspace" },
  { id: "invoices", label: "Invoices" },
  { id: "accruals", label: "Accruals" },
  { id: "journals", label: "Journals" },
  { id: "ledger", label: "Ledger" },
  { id: "trial-balance", label: "Trial balance" },
  { id: "account-statement", label: "Account statement" }
];
