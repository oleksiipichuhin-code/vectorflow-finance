/**
 * Create Accrual helpers for optional Source Invoice selection.
 * Create uses a single POST; no post-create change-source-invoice.
 */
import i18n from "./i18n/index.ts";

export type CreateAccrualFailure = {
  message: string;
  keepFormOpen: boolean;
  /** Clear only the stale Source Invoice selection after confirmed Invoice NotFound. */
  clearSourceInvoiceSelection: boolean;
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

function invoiceNotFoundMessage(): string {
  return i18n.t("accruals.error.invoiceNotFoundCreate", { ns: "finance" });
}

function workspaceNotFoundMessage(): string {
  return i18n.t("accruals.error.workspaceNotFound", { ns: "finance" });
}

function conflictMessage(): string {
  return i18n.t("accruals.error.createConflict", { ns: "finance" });
}

/**
 * Map Finance API / network failures for Create Accrual.
 * Keeps the form open; never auto-retries; never treats errors as success.
 */
export function interpretCreateAccrualError(error: unknown): CreateAccrualFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      const invoiceMissing = /invoice/i.test(apiFailure.message);
      const workspaceMissing = /workspace/i.test(apiFailure.message);
      return {
        message: invoiceMissing
          ? invoiceNotFoundMessage()
          : workspaceMissing
            ? workspaceNotFoundMessage()
            : apiFailure.message,
        keepFormOpen: true,
        clearSourceInvoiceSelection: invoiceMissing
      };
    }

    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: conflictMessage(),
        keepFormOpen: true,
        clearSourceInvoiceSelection: false
      };
    }

    if (apiFailure.status === 400 || apiFailure.errorKind === "ValidationFailed") {
      return {
        message: apiFailure.message,
        keepFormOpen: true,
        clearSourceInvoiceSelection: false
      };
    }

    return {
      message: apiFailure.message,
      keepFormOpen: true,
      clearSourceInvoiceSelection: false
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      keepFormOpen: true,
      clearSourceInvoiceSelection: false
    };
  }

  return {
    message: i18n.t("accruals.error.createFailed", { ns: "finance" }),
    keepFormOpen: true,
    clearSourceInvoiceSelection: false
  };
}
