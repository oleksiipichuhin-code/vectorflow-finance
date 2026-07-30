import i18n from "./i18n/index.ts";
import type { Accrual, Invoice } from "./api.ts";
import { interpretCreateAccrualError } from "./accrualCreate.ts";
import { formatAccrualAmountInput, parseAccrualAmountInput } from "./accrualEditAmount.ts";

/** Mirrors Domain Accrual.DescriptionMaxLength. */
export const ACCRUAL_DESCRIPTION_MAX_LENGTH = 500;

export const ACCRUAL_TYPE_OPTIONS = ["Revenue", "Expense"] as const;
export type AccrualTypeOption = (typeof ACCRUAL_TYPE_OPTIONS)[number];

const LINKABLE_INVOICE_STATUSES = new Set(["Draft", "Issued"]);

export type CreateAccrualFromInvoiceValues = {
  type: AccrualTypeOption;
  amount: string;
  currency: string;
  recognitionDate: string;
  description: string;
};

export type CreateAccrualFromInvoiceInput = {
  type: AccrualTypeOption;
  amount: number;
  currency: string;
  recognitionDateUtc: string;
  description: string;
  sourceInvoiceId: string;
};

/**
 * Any Draft/Issued Invoice may seed a draft Accrual (backend has no status restriction).
 */
export function canCreateAccrualFromInvoice(
  invoice: Pick<Invoice, "status">
): boolean {
  return LINKABLE_INVOICE_STATUSES.has(invoice.status);
}

/** UTC calendar date for `<input type="date">`. */
export function todayRecognitionDateInputValue(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function defaultDescriptionFromInvoice(
  invoice: Pick<Invoice, "documentNumber">
): string {
  const label = i18n.t("invoices.accrualDescriptionDefault", {
    ns: "finance",
    document: invoice.documentNumber.trim()
  });
  if (label.length <= ACCRUAL_DESCRIPTION_MAX_LENGTH) {
    return label;
  }

  return label.slice(0, ACCRUAL_DESCRIPTION_MAX_LENGTH);
}

/**
 * Prefill create form from the open Invoice.
 * Amount is blank when total is non-positive so the operator must enter a valid value.
 */
export function initialCreateAccrualFromInvoiceValues(
  invoice: Pick<Invoice, "documentNumber" | "currency" | "totalAmount">,
  now = new Date()
): CreateAccrualFromInvoiceValues {
  return {
    type: "Revenue",
    amount:
      Number.isFinite(invoice.totalAmount) && invoice.totalAmount > 0
        ? formatAccrualAmountInput(invoice.totalAmount)
        : "",
    currency: invoice.currency,
    recognitionDate: todayRecognitionDateInputValue(now),
    description: defaultDescriptionFromInvoice(invoice)
  };
}

export function recognitionDateInputToUtcIso(dateInput: string): string {
  const trimmed = dateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(i18n.t("invoices.error.recognitionDateFormat", { ns: "finance" }));
  }

  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

export function normalizeAccrualCurrency(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(i18n.t("invoices.error.currencyRequired", { ns: "finance" }));
  }

  return raw.trim().toUpperCase();
}

export function normalizeAccrualDescription(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(i18n.t("invoices.error.descriptionRequired", { ns: "finance" }));
  }

  const normalized = raw.trim();
  if (normalized.length > ACCRUAL_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      i18n.t("invoices.error.accrualDescriptionTooLong", {
        ns: "finance",
        max: ACCRUAL_DESCRIPTION_MAX_LENGTH
      })
    );
  }

  return normalized;
}

export function normalizeAccrualType(raw: string): AccrualTypeOption {
  if (raw === "Revenue" || raw === "Expense") {
    return raw;
  }

  throw new Error(i18n.t("invoices.error.accrualTypeInvalid", { ns: "finance" }));
}

/**
 * Client-side validation before POST. Server remains authoritative.
 */
export function parseCreateAccrualFromInvoiceValues(
  values: CreateAccrualFromInvoiceValues,
  sourceInvoiceId: string
): CreateAccrualFromInvoiceInput {
  return {
    type: normalizeAccrualType(values.type),
    amount: parseAccrualAmountInput(values.amount),
    currency: normalizeAccrualCurrency(values.currency),
    recognitionDateUtc: recognitionDateInputToUtcIso(values.recognitionDate),
    description: normalizeAccrualDescription(values.description),
    sourceInvoiceId
  };
}

export function validateCreateAccrualFromInvoiceValues(
  values: CreateAccrualFromInvoiceValues
): string | null {
  try {
    parseCreateAccrualFromInvoiceValues(values, "00000000-0000-0000-0000-000000000001");
  } catch (error) {
    return error instanceof Error ? error.message : i18n.t("invoices.error.checkFormFields", { ns: "finance" });
  }

  return null;
}

export type ApplyCreateAccrualFromInvoiceDeps = {
  createAccrual: (
    workspaceId: string,
    input: {
      type: string;
      amount: number;
      currency: string;
      recognitionDateUtc: string;
      description: string;
      sourceInvoiceId?: string | null;
    }
  ) => Promise<Accrual>;
};

/**
 * Exactly one createAccrual POST with locked sourceInvoiceId.
 */
export async function applyCreateAccrualFromInvoice(
  workspaceId: string,
  invoice: Pick<Invoice, "id">,
  values: CreateAccrualFromInvoiceValues,
  deps: ApplyCreateAccrualFromInvoiceDeps
): Promise<Accrual> {
  const input = parseCreateAccrualFromInvoiceValues(values, invoice.id);
  return deps.createAccrual(workspaceId, input);
}

export type CreateAccrualFromInvoiceFailure = {
  message: string;
  keepFormOpen: boolean;
  /** Invoice missing — close form and refresh invoice list/detail. */
  refreshInvoice: boolean;
};

/**
 * Reuse Create Accrual error mapping; Invoice NotFound closes the bridge form.
 */
export function interpretCreateAccrualFromInvoiceError(
  error: unknown
): CreateAccrualFromInvoiceFailure {
  const failure = interpretCreateAccrualError(error);
  return {
    message: failure.message,
    keepFormOpen: failure.keepFormOpen && !failure.clearSourceInvoiceSelection,
    refreshInvoice: failure.clearSourceInvoiceSelection
  };
}

export type RelatedAccrualsLoadFailure = {
  kind: "retryable";
  message: string;
};

const RELATED_ACCRUALS_LOAD_FAILED_MESSAGE =
  i18n.t("invoices.error.relatedAccrualsLoadFailed", { ns: "finance" });

export function interpretRelatedAccrualsLoadError(
  error: unknown
): RelatedAccrualsLoadFailure {
  if (error instanceof Error && error.message.trim()) {
    return {
      kind: "retryable",
      message: error.message
    };
  }

  return {
    kind: "retryable",
    message: RELATED_ACCRUALS_LOAD_FAILED_MESSAGE
  };
}

export type RelatedAccrualRowView = {
  id: string;
  description: string;
  status: string;
  amountDisplay: string;
  recognitionDateDisplay: string;
};

export function buildRelatedAccrualRowView(
  accrual: Accrual,
  formatMoney: (amount: number, currency: string) => string,
  formatDate: (value: string | null | undefined) => string
): RelatedAccrualRowView {
  return {
    id: accrual.id,
    description: accrual.description,
    status: accrual.status,
    amountDisplay: formatMoney(accrual.amount, accrual.currency),
    recognitionDateDisplay: formatDate(accrual.recognitionDateUtc)
  };
}

/**
 * After successful create, reload related accruals for the same open invoice.
 */
export function shouldReloadRelatedAccrualsAfterCreate(
  detailTargetId: string | null | undefined,
  sourceInvoiceId: string
): boolean {
  return Boolean(detailTargetId) && detailTargetId === sourceInvoiceId;
}
