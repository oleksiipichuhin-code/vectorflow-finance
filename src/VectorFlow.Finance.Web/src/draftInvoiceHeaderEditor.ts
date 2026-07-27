import type { Invoice } from "./api.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";

/** Mirrors Domain Invoice.DocumentNumberMaxLength. */
export const INVOICE_DOCUMENT_NUMBER_MAX_LENGTH = 64;

/** Mirrors Domain CounterpartyReference.MaxLength. */
export const INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH = 128;

export type DraftInvoiceHeaderEditorField =
  | "documentNumber"
  | "counterpartyReference"
  | "currency";

/** Stable mutation order for multi-field saves (sequential, never parallel). */
export const DRAFT_INVOICE_HEADER_EDITOR_FIELD_ORDER: readonly DraftInvoiceHeaderEditorField[] =
  ["documentNumber", "counterpartyReference", "currency"] as const;

export type DraftInvoiceHeaderEditorValues = {
  documentNumber: string;
  counterpartyReference: string;
  currency: string;
};

export function canEditDraftInvoiceHeader(invoice: Pick<Invoice, "status">): boolean {
  return isDraftInvoice(invoice);
}

export function valuesFromInvoice(
  invoice: Pick<Invoice, "documentNumber" | "counterpartyReference" | "currency">
): DraftInvoiceHeaderEditorValues {
  return {
    documentNumber: invoice.documentNumber,
    counterpartyReference: invoice.counterpartyReference,
    currency: invoice.currency
  };
}

export function normalizeDocumentNumber(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Номер документа не може бути порожнім.");
  }

  const normalized = raw.trim();
  if (normalized.length > INVOICE_DOCUMENT_NUMBER_MAX_LENGTH) {
    throw new Error(
      `Номер документа не може перевищувати ${INVOICE_DOCUMENT_NUMBER_MAX_LENGTH} символів.`
    );
  }

  return normalized;
}

export function normalizeCounterpartyReference(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Контрагент не може бути порожнім.");
  }

  const normalized = raw.trim();
  if (normalized.length > INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH) {
    throw new Error(
      `Контрагент не може перевищувати ${INVOICE_COUNTERPARTY_REFERENCE_MAX_LENGTH} символів.`
    );
  }

  return normalized;
}

export function normalizeInvoiceCurrency(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Валюта не може бути порожньою.");
  }

  return raw.trim().toUpperCase();
}

/**
 * Client-side validation before any mutation.
 * Server remains authoritative for edge cases.
 */
export function validateDraftInvoiceHeaderEditorValues(
  draft: DraftInvoiceHeaderEditorValues
): string | null {
  try {
    normalizeDocumentNumber(draft.documentNumber);
    normalizeCounterpartyReference(draft.counterpartyReference);
    normalizeInvoiceCurrency(draft.currency);
  } catch (error) {
    return error instanceof Error ? error.message : "Перевірте поля редактора.";
  }

  return null;
}

function normalizedComparable(
  values: DraftInvoiceHeaderEditorValues
): DraftInvoiceHeaderEditorValues {
  return {
    documentNumber: values.documentNumber.trim(),
    counterpartyReference: values.counterpartyReference.trim(),
    currency: values.currency.trim().toUpperCase()
  };
}

/**
 * Returns only fields that differ from baseline, in DRAFT_INVOICE_HEADER_EDITOR_FIELD_ORDER.
 * Unchanged fields are omitted — callers must not POST for them.
 */
export function detectDraftInvoiceHeaderEditorChanges(
  baseline: DraftInvoiceHeaderEditorValues,
  draft: DraftInvoiceHeaderEditorValues
): DraftInvoiceHeaderEditorField[] {
  const left = normalizedComparable(baseline);
  const right = normalizedComparable(draft);
  const changed: DraftInvoiceHeaderEditorField[] = [];

  for (const field of DRAFT_INVOICE_HEADER_EDITOR_FIELD_ORDER) {
    if (left[field] !== right[field]) {
      changed.push(field);
    }
  }

  return changed;
}

export type DraftInvoiceHeaderEditorMutations = {
  changeDocumentNumber: (
    workspaceId: string,
    invoiceId: string,
    documentNumber: string
  ) => Promise<Invoice>;
  changeCounterparty: (
    workspaceId: string,
    invoiceId: string,
    counterpartyReference: string
  ) => Promise<Invoice>;
  changeCurrency: (
    workspaceId: string,
    invoiceId: string,
    currency: string
  ) => Promise<Invoice>;
};

/**
 * Applies only changed fields via existing atomic POSTs, sequentially.
 * Stops on the first failure; does not roll back prior successes.
 * Returns null when nothing changed (no requests).
 */
export async function applyDraftInvoiceHeaderEditorChanges(
  workspaceId: string,
  invoiceId: string,
  baseline: DraftInvoiceHeaderEditorValues,
  draft: DraftInvoiceHeaderEditorValues,
  mutations: DraftInvoiceHeaderEditorMutations
): Promise<Invoice | null> {
  const validationError = validateDraftInvoiceHeaderEditorValues(draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const changed = detectDraftInvoiceHeaderEditorChanges(baseline, draft);
  if (changed.length === 0) {
    return null;
  }

  let last: Invoice | null = null;

  for (const field of changed) {
    switch (field) {
      case "documentNumber":
        last = await mutations.changeDocumentNumber(
          workspaceId,
          invoiceId,
          normalizeDocumentNumber(draft.documentNumber)
        );
        break;
      case "counterpartyReference":
        last = await mutations.changeCounterparty(
          workspaceId,
          invoiceId,
          normalizeCounterpartyReference(draft.counterpartyReference)
        );
        break;
      case "currency":
        last = await mutations.changeCurrency(
          workspaceId,
          invoiceId,
          normalizeInvoiceCurrency(draft.currency)
        );
        break;
      default: {
        const _exhaustive: never = field;
        throw new Error(`Unsupported header editor field: ${String(_exhaustive)}`);
      }
    }
  }

  return last;
}

export type DraftInvoiceHeaderEditorFailure = {
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

/**
 * Map Finance API / network failures for draft header editor.
 * Conflict and NotFound close the editor and require a list refresh.
 * Validation and network stay in the editor; no auto-retry.
 */
export function interpretDraftInvoiceHeaderEditorError(
  error: unknown
): DraftInvoiceHeaderEditorFailure {
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
    message: "Не вдалося змінити реквізити рахунка.",
    keepEditorOpen: true,
    refreshList: false
  };
}
