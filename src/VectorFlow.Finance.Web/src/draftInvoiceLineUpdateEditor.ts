import i18n from "./i18n/index.ts";
import type { Invoice, InvoiceLine } from "./api.ts";
import {
  INVOICE_LINE_DESCRIPTION_MAX_LENGTH,
  parseDraftInvoiceLineAddInput,
  validateDraftInvoiceLineAddInput,
  type DraftInvoiceLineAddInput,
  type ParsedDraftInvoiceLineAdd
} from "./draftInvoiceLineAddEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";

export { INVOICE_LINE_DESCRIPTION_MAX_LENGTH };

export type DraftInvoiceLineUpdateInput = DraftInvoiceLineAddInput;
export type ParsedDraftInvoiceLineUpdate = ParsedDraftInvoiceLineAdd;

export type DraftInvoiceLineUpdateFailure = {
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
  i18n.t("invoices.error.invoiceChangedLineUpdate", { ns: "finance" });

const NOT_FOUND_OPERATOR_MESSAGE =
  i18n.t("invoices.error.invoiceNotFound", { ns: "finance" });

export function canUpdateDraftInvoiceLine(invoice: Pick<Invoice, "status">): boolean {
  return isDraftInvoice(invoice);
}

function formatEditableDecimal(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

/** Prefill the update form from an authoritative Invoice line. */
export function initialDraftInvoiceLineUpdateInput(
  line: Pick<InvoiceLine, "quantity" | "unitPrice" | "description">
): DraftInvoiceLineUpdateInput {
  return {
    quantity: formatEditableDecimal(line.quantity),
    unitPrice: formatEditableDecimal(line.unitPrice),
    description: line.description ?? ""
  };
}

export function findInvoiceLine(
  invoice: Pick<Invoice, "lines">,
  lineId: string
): InvoiceLine | null {
  return (invoice.lines ?? []).find((line) => line.id === lineId) ?? null;
}

export function validateDraftInvoiceLineUpdateInput(
  input: DraftInvoiceLineUpdateInput
): string | null {
  return validateDraftInvoiceLineAddInput(input);
}

export function parseDraftInvoiceLineUpdateInput(
  input: DraftInvoiceLineUpdateInput
): ParsedDraftInvoiceLineUpdate {
  return parseDraftInvoiceLineAddInput(input);
}

export type UpdateInvoiceLineMutation = (
  workspaceId: string,
  invoiceId: string,
  lineId: string,
  input: {
    quantity: number;
    unitPrice: number;
    description?: string | null;
  }
) => Promise<Invoice>;

/**
 * Applies exactly one updateInvoiceLine call. Never issues the invoice.
 */
export async function applyDraftInvoiceLineUpdate(
  workspaceId: string,
  invoiceId: string,
  lineId: string,
  input: DraftInvoiceLineUpdateInput,
  updateLine: UpdateInvoiceLineMutation
): Promise<Invoice> {
  const parsed = parseDraftInvoiceLineUpdateInput(input);
  return updateLine(workspaceId, invoiceId, lineId, {
    quantity: parsed.quantity,
    unitPrice: parsed.unitPrice,
    description: parsed.description
  });
}

/**
 * Map Finance API / network failures for draft line update.
 * Conflict and NotFound close the editor and require a list refresh.
 * Validation and network stay in the editor; no auto-retry.
 */
export function interpretDraftInvoiceLineUpdateError(
  error: unknown
): DraftInvoiceLineUpdateFailure {
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
    message: i18n.t("invoices.error.lineUpdateFailed", { ns: "finance" }),
    keepEditorOpen: true,
    refreshList: false
  };
}
