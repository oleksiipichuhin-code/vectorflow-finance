import type { Invoice } from "./api";

export type InvoiceIssueReadiness = {
  ready: boolean;
  needsDueDate: boolean;
  needsLine: boolean;
};

export function isDraftInvoice(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "Draft";
}

export function getInvoiceIssueReadiness(
  invoice: Pick<Invoice, "status" | "dueDateUtc" | "totalAmount">
): InvoiceIssueReadiness {
  if (!isDraftInvoice(invoice)) {
    return { ready: false, needsDueDate: false, needsLine: false };
  }

  const needsDueDate = !invoice.dueDateUtc;
  const total = Number(invoice.totalAmount);
  const needsLine = !Number.isFinite(total) || total <= 0;

  return {
    ready: !needsDueDate && !needsLine,
    needsDueDate,
    needsLine
  };
}

/** Converts a `YYYY-MM-DD` date input to an absolute UTC midnight ISO string. */
export function toDueDateUtcIso(dateInput: string): string {
  const trimmed = dateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Дата оплати має бути у форматі YYYY-MM-DD.");
  }

  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

export function defaultDueDateInputValue(from: Date = new Date()): string {
  const due = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 30)
  );
  return due.toISOString().slice(0, 10);
}
