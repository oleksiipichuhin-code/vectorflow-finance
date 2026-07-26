import type { Invoice } from "./api.ts";
import { isDraftInvoice, toDueDateUtcIso } from "./invoiceIssue.ts";

export type DraftInvoiceDueDateEditFailure = {
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
  "Рахунок було змінено іншою дією. Список оновлено — відкрийте редагування знову з актуальними даними.";

const NOT_FOUND_OPERATOR_MESSAGE =
  "Рахунок не знайдено. Список оновлено з сервера.";

export function canEditDraftInvoiceDueDate(
  invoice: Pick<Invoice, "status">
): boolean {
  return isDraftInvoice(invoice);
}

/** Prefill date input from server dueDateUtc ISO; empty when unset. */
export function formatDueDateInput(dueDateUtc: string | null | undefined): string {
  if (!dueDateUtc) {
    return "";
  }

  const trimmed = dueDateUtc.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function initialDueDateInputValue(
  invoice: Pick<Invoice, "dueDateUtc">
): string {
  return formatDueDateInput(invoice.dueDateUtc);
}

/**
 * Client-side validation before any mutation.
 * Server remains authoritative for edge cases.
 */
export function validateDraftInvoiceDueDateInput(dateInput: string): string | null {
  try {
    toDueDateUtcIso(dateInput);
  } catch (error) {
    return error instanceof Error ? error.message : "Перевірте дату оплати.";
  }

  return null;
}

export type SetInvoiceDueDateMutation = (
  workspaceId: string,
  invoiceId: string,
  dueDateUtc: string
) => Promise<Invoice>;

/**
 * Applies exactly one setInvoiceDueDate call. Never issues the invoice.
 */
export async function applyDraftInvoiceDueDateChange(
  workspaceId: string,
  invoiceId: string,
  dateInput: string,
  setDueDate: SetInvoiceDueDateMutation
): Promise<Invoice> {
  const validationError = validateDraftInvoiceDueDateInput(dateInput);
  if (validationError) {
    throw new Error(validationError);
  }

  const dueDateUtc = toDueDateUtcIso(dateInput);
  return setDueDate(workspaceId, invoiceId, dueDateUtc);
}

/**
 * Map Finance API / network failures for draft due-date edit.
 * Conflict and NotFound close the editor and require a list refresh.
 * Validation and network stay in the editor; no auto-retry.
 */
export function interpretDraftInvoiceDueDateEditError(
  error: unknown
): DraftInvoiceDueDateEditFailure {
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
    message: "Не вдалося змінити дату оплати.",
    keepEditorOpen: true,
    refreshList: false
  };
}
