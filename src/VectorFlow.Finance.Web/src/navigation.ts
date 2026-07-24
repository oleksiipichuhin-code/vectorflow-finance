export type AppView = "dashboard" | "workspace" | "invoices" | "accruals";

export const APP_VIEWS: ReadonlyArray<{ id: AppView; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "workspace", label: "Workspace" },
  { id: "invoices", label: "Invoices" },
  { id: "accruals", label: "Accruals" }
];
