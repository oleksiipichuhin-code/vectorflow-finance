import type { Accrual, Invoice, InvoiceListQueryOptions } from "./api";

/** Server allows 1..100; keep picker pages small with explicit navigation. */
export const SOURCE_INVOICE_PICKER_PAGE_SIZE = 10;

export type InvoicePickerSummary = Pick<
  Invoice,
  "id" | "documentNumber" | "counterpartyReference" | "currency" | "status" | "totalAmount"
>;

export function canChangeAccrualSourceInvoice(
  accrual: Pick<Accrual, "status">
): boolean {
  return accrual.status === "Draft";
}

export function toInvoicePickerSummary(invoice: Invoice): InvoicePickerSummary {
  return {
    id: invoice.id,
    documentNumber: invoice.documentNumber,
    counterpartyReference: invoice.counterpartyReference,
    currency: invoice.currency,
    status: invoice.status,
    totalAmount: invoice.totalAmount
  };
}

function formatInvoiceMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatSourceInvoiceSelection(
  invoice: InvoicePickerSummary | null | undefined
): string {
  if (!invoice) {
    return "Не вибрано";
  }

  return `${invoice.documentNumber} · ${invoice.status} · ${formatInvoiceMoney(
    invoice.totalAmount,
    invoice.currency
  )} · ${invoice.counterpartyReference}`;
}

export function hasSourceInvoiceSelectionChanged(
  baselineInvoiceId: string | null,
  selectedInvoiceId: string | null
): boolean {
  return baselineInvoiceId !== selectedInvoiceId;
}

export function normalizePickerDocumentNumber(raw: string): string {
  return raw.trim();
}

export function buildSourceInvoicePickerQuery(
  page: number,
  documentNumberDraft: string
): { query: InvoiceListQueryOptions; validationError: string | null } {
  const safePage = Number.isFinite(page) ? Math.floor(page) : 0;
  if (safePage < 1) {
    return {
      query: { page: 1, pageSize: SOURCE_INVOICE_PICKER_PAGE_SIZE },
      validationError: "Номер сторінки має бути не меншим за 1."
    };
  }

  const documentNumber = normalizePickerDocumentNumber(documentNumberDraft) || undefined;
  const query: InvoiceListQueryOptions = {
    page: safePage,
    pageSize: SOURCE_INVOICE_PICKER_PAGE_SIZE
  };

  if (documentNumber) {
    query.documentNumber = documentNumber;
  }

  return { query, validationError: null };
}

export type AccrualSourceInvoiceEditFailure = {
  message: string;
  keepEditorOpen: boolean;
  refreshList: boolean;
};

const CONFLICT_OPERATOR_MESSAGE =
  "Нарахування було змінено іншою дією. Список оновлено — відкрийте вибір рахунку знову з актуальними даними.";

const ACCRUAL_NOT_FOUND_MESSAGE =
  "Нарахування не знайдено. Список оновлено з сервера.";

const INVOICE_NOT_FOUND_MESSAGE =
  "Рахунок більше недоступний у цьому workspace. Список оновлено з сервера.";

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

/**
 * Map Finance API failures for draft source-invoice set/clear.
 * Conflict/NotFound close the editor and refresh; validation stays open.
 */
export function interpretAccrualSourceInvoiceEditError(
  error: unknown
): AccrualSourceInvoiceEditFailure {
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
      const invoiceMissing = /invoice/i.test(apiFailure.message);
      return {
        message: invoiceMissing ? INVOICE_NOT_FOUND_MESSAGE : ACCRUAL_NOT_FOUND_MESSAGE,
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
    message: "Не вдалося змінити рахунок-джерело нарахування.",
    keepEditorOpen: true,
    refreshList: false
  };
}

export function formatAccrualSourceInvoiceListCell(
  sourceInvoiceId: string | null,
  cached: InvoicePickerSummary | null | undefined
): string {
  if (!sourceInvoiceId) {
    return "—";
  }

  if (cached?.documentNumber) {
    return cached.documentNumber;
  }

  return "Вибрано";
}
