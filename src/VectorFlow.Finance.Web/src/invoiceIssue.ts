import i18n from "./i18n/index.ts";
import type { Invoice } from "./api";

export type InvoiceIssueReadiness = {
  ready: boolean;
  needsDueDate: boolean;
  needsLine: boolean;
};

export type InvoiceIssueFailure = {
  message: string;
  keepEditorOpen: boolean;
  refreshList: boolean;
};

type ApiFailureShape = {
  status: number;
  errorKind: string | null;
  message: string;
};

function asApiFailure(error: unknown): ApiFailureShape | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as Error & {
    status?: unknown;
    errorKind?: unknown;
  };

  if (typeof candidate.status !== "number") {
    return null;
  }

  return {
    status: candidate.status,
    errorKind: typeof candidate.errorKind === "string" ? candidate.errorKind : null,
    message: candidate.message
  };
}

const CONFLICT_OPERATOR_MESSAGE =
  i18n.t("invoices.error.invoiceChangedIssue", { ns: "finance" });

const NOT_FOUND_OPERATOR_MESSAGE =
  i18n.t("invoices.error.invoiceNotFound", { ns: "finance" });

/**
 * Map Finance API / network failures for issue.
 * Conflict and NotFound close the prepare form and require a list refresh.
 * Validation stays in the form; server remains authoritative for edge cases.
 */
export function interpretInvoiceIssueError(error: unknown): InvoiceIssueFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: CONFLICT_OPERATOR_MESSAGE,
        keepEditorOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        message: NOT_FOUND_OPERATOR_MESSAGE,
        keepEditorOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 400 || apiFailure.errorKind === "ValidationFailed") {
      return {
        message: apiFailure.message,
        keepEditorOpen: true,
        refreshList: false
      };
    }

    return {
      message: apiFailure.message,
      keepEditorOpen: true,
      refreshList: false
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      keepEditorOpen: true,
      refreshList: false
    };
  }

  return {
    message: i18n.t("invoices.error.issueFailed", { ns: "finance" }),
    keepEditorOpen: true,
    refreshList: false
  };
}

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
    throw new Error(i18n.t("invoices.error.dueDateFormat", { ns: "finance" }));
  }

  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

export function defaultDueDateInputValue(from: Date = new Date()): string {
  const due = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 30)
  );
  return due.toISOString().slice(0, 10);
}
