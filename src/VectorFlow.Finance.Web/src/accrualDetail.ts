import type { Accrual, Invoice } from "./api.ts";
import {
  formatSourceInvoiceSelection,
  toInvoicePickerSummary,
  type InvoicePickerSummary
} from "./accrualSourceInvoice.ts";
import { formatDate, formatMoney } from "./format.ts";

const VIEWABLE_STATUSES = new Set(["Draft", "Recognized", "Reversed"]);

export function canViewAccrualDetails(accrual: Pick<Accrual, "status">): boolean {
  return VIEWABLE_STATUSES.has(accrual.status);
}

export type AccrualDetailLoadFailure = {
  kind: "not_found" | "retryable";
  message: string;
  refreshList: boolean;
  clearAccrualData: boolean;
};

export type SourceInvoiceDetailLoadFailure = {
  kind: "not_found" | "retryable";
  message: string;
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

const ACCRUAL_NOT_FOUND_MESSAGE =
  "Нарахування більше недоступне. Список оновлено з сервера.";

const ACCRUAL_LOAD_FAILED_MESSAGE = "Не вдалося завантажити нарахування.";

const INVOICE_NOT_FOUND_MESSAGE = "Повʼязаний рахунок недоступний.";

const INVOICE_LOAD_FAILED_MESSAGE = "Не вдалося завантажити рахунок-джерело.";

/**
 * Map Accrual GET-by-id failures for the read-only detail panel.
 * 404 clears stale accrual data and refreshes the list.
 * Network / 5xx keep the panel open for retry without mutation.
 */
export function interpretAccrualDetailLoadError(error: unknown): AccrualDetailLoadFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        kind: "not_found",
        message: ACCRUAL_NOT_FOUND_MESSAGE,
        refreshList: true,
        clearAccrualData: true
      };
    }

    return {
      kind: "retryable",
      message: apiFailure.message || ACCRUAL_LOAD_FAILED_MESSAGE,
      refreshList: false,
      clearAccrualData: true
    };
  }

  if (error instanceof Error) {
    return {
      kind: "retryable",
      message: error.message || ACCRUAL_LOAD_FAILED_MESSAGE,
      refreshList: false,
      clearAccrualData: true
    };
  }

  return {
    kind: "retryable",
    message: ACCRUAL_LOAD_FAILED_MESSAGE,
    refreshList: false,
    clearAccrualData: true
  };
}

/**
 * Map Source Invoice GET-by-id failures independently of Accrual lookup.
 * Invoice 404 does not treat the Accrual as missing.
 */
export function interpretSourceInvoiceDetailLoadError(
  error: unknown
): SourceInvoiceDetailLoadFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        kind: "not_found",
        message: INVOICE_NOT_FOUND_MESSAGE
      };
    }

    return {
      kind: "retryable",
      message: apiFailure.message || INVOICE_LOAD_FAILED_MESSAGE
    };
  }

  if (error instanceof Error) {
    return {
      kind: "retryable",
      message: error.message || INVOICE_LOAD_FAILED_MESSAGE
    };
  }

  return {
    kind: "retryable",
    message: INVOICE_LOAD_FAILED_MESSAGE
  };
}

export type AccrualDetailFieldView = {
  description: string;
  status: string;
  type: string;
  amountDisplay: string;
  currency: string;
  recognitionDateDisplay: string;
  createdAtDisplay: string;
  updatedAtDisplay: string;
  recognizedAtDisplay: string;
  reversedAtDisplay: string;
  reversalReasonDisplay: string;
  accrualId: string;
};

/** Build read-only display fields from authoritative Accrual DTO. */
export function buildAccrualDetailFields(accrual: Accrual): AccrualDetailFieldView {
  return {
    description: accrual.description,
    status: accrual.status,
    type: accrual.type,
    amountDisplay: formatMoney(accrual.amount, accrual.currency),
    currency: accrual.currency,
    recognitionDateDisplay: formatDate(accrual.recognitionDateUtc),
    createdAtDisplay: formatDate(accrual.createdAtUtc),
    updatedAtDisplay: formatDate(accrual.updatedAtUtc),
    recognizedAtDisplay: formatDate(accrual.recognizedAtUtc),
    reversedAtDisplay: formatDate(accrual.reversedAtUtc),
    reversalReasonDisplay: accrual.reversalReason?.trim() ? accrual.reversalReason : "—",
    accrualId: accrual.id
  };
}

export type SourceInvoiceDetailView =
  | { kind: "none"; display: string }
  | { kind: "loading" }
  | { kind: "ready"; invoice: InvoicePickerSummary; display: string }
  | { kind: "unavailable"; message: string }
  | { kind: "error"; message: string; retryable: true };

export function sourceInvoiceDetailNone(): SourceInvoiceDetailView {
  return {
    kind: "none",
    display: formatSourceInvoiceSelection(null)
  };
}

export function sourceInvoiceDetailFromInvoice(invoice: Invoice): SourceInvoiceDetailView {
  const summary = toInvoicePickerSummary(invoice);
  return {
    kind: "ready",
    invoice: summary,
    display: formatSourceInvoiceSelection(summary)
  };
}

export function shouldLoadSourceInvoice(
  sourceInvoiceId: string | null | undefined
): sourceInvoiceId is string {
  return typeof sourceInvoiceId === "string" && sourceInvoiceId.length > 0;
}
