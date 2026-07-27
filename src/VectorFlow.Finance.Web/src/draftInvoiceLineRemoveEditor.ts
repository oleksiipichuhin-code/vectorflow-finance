import type { Invoice, InvoiceLine } from "./api.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";

export type DraftInvoiceLineRemoveFailure = {
  message: string;
  keepConfirmationOpen: boolean;
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
  "Рахунок або рядок було змінено іншою дією. Список оновлено — відкрийте видалення знову з актуальними даними.";

const NOT_FOUND_OPERATOR_MESSAGE =
  "Рахунок не знайдено. Список оновлено з сервера.";

export function canRemoveDraftInvoiceLine(invoice: Pick<Invoice, "status">): boolean {
  return isDraftInvoice(invoice);
}

/** Operator-facing identity for the remove confirmation. */
export function draftInvoiceLineConfirmationLabel(
  line: Pick<InvoiceLine, "sequence" | "description">
): string {
  const description = line.description?.trim();
  const descriptionPart = description && description.length > 0 ? description : "без опису";
  return `#${line.sequence} · ${descriptionPart}`;
}

export type RemoveInvoiceLineMutation = (
  workspaceId: string,
  invoiceId: string,
  lineId: string
) => Promise<Invoice>;

/**
 * Applies exactly one removeInvoiceLine call. Never issues the invoice.
 * Empty Draft (final line removed) is valid per backend; Issue remains blocked separately.
 */
export async function applyDraftInvoiceLineRemove(
  workspaceId: string,
  invoiceId: string,
  lineId: string,
  removeLine: RemoveInvoiceLineMutation
): Promise<Invoice> {
  return removeLine(workspaceId, invoiceId, lineId);
}

/**
 * Map Finance API / network failures for draft line remove.
 * Conflict and NotFound close confirmation and require a list refresh.
 * Validation stays recoverable; no auto-retry.
 */
export function interpretDraftInvoiceLineRemoveError(
  error: unknown
): DraftInvoiceLineRemoveFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: CONFLICT_OPERATOR_MESSAGE,
        keepConfirmationOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        message: NOT_FOUND_OPERATOR_MESSAGE,
        keepConfirmationOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 400 || apiFailure.errorKind === "ValidationFailed") {
      return {
        message: apiFailure.message,
        keepConfirmationOpen: true,
        refreshList: false
      };
    }

    return {
      message: apiFailure.message,
      keepConfirmationOpen: true,
      refreshList: false
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      keepConfirmationOpen: true,
      refreshList: false
    };
  }

  return {
    message: "Не вдалося видалити рядок рахунка.",
    keepConfirmationOpen: true,
    refreshList: false
  };
}
