import i18n from "./i18n/index.ts";
import type { Invoice } from "./api.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";

export const INVOICE_LINE_DESCRIPTION_MAX_LENGTH = 500;

export type DraftInvoiceLineAddInput = {
  quantity: string;
  unitPrice: string;
  description: string;
};

export type ParsedDraftInvoiceLineAdd = {
  quantity: number;
  unitPrice: number;
  description: string | null;
};

export type DraftInvoiceLineAddFailure = {
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
  i18n.t("invoices.error.invoiceChangedLineAdd", { ns: "finance" });

const NOT_FOUND_OPERATOR_MESSAGE =
  i18n.t("invoices.error.invoiceNotFound", { ns: "finance" });

export function canAddDraftInvoiceLine(invoice: Pick<Invoice, "status">): boolean {
  return isDraftInvoice(invoice);
}

/** Initial empty form for a new Draft line append. */
export function initialDraftInvoiceLineAddInput(): DraftInvoiceLineAddInput {
  return {
    quantity: "1",
    unitPrice: "",
    description: ""
  };
}

/**
 * Client-side structural validation before any mutation.
 * Mirrors domain amount/description rules; server remains authoritative.
 */
export function validateDraftInvoiceLineAddInput(
  input: DraftInvoiceLineAddInput
): string | null {
  const quantity = Number(input.quantity.replace(",", "."));
  const unitPrice = Number(input.unitPrice.replace(",", "."));

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return i18n.t("invoices.error.quantityPositive", { ns: "finance" });
  }

  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return i18n.t("invoices.error.priceNonNegative", { ns: "finance" });
  }

  if (quantity * unitPrice <= 0) {
    return i18n.t("invoices.error.lineAmountPositive", { ns: "finance" });
  }

  const description = input.description.trim();
  if (description.length > INVOICE_LINE_DESCRIPTION_MAX_LENGTH) {
    return i18n.t("invoices.error.lineDescriptionTooLong", {
      ns: "finance",
      max: INVOICE_LINE_DESCRIPTION_MAX_LENGTH
    });
  }

  return null;
}

export function parseDraftInvoiceLineAddInput(
  input: DraftInvoiceLineAddInput
): ParsedDraftInvoiceLineAdd {
  const validationError = validateDraftInvoiceLineAddInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const quantity = Number(input.quantity.replace(",", "."));
  const unitPrice = Number(input.unitPrice.replace(",", "."));
  const description = input.description.trim();

  return {
    quantity,
    unitPrice,
    description: description.length > 0 ? description : null
  };
}

export type AddInvoiceLineMutation = (
  workspaceId: string,
  invoiceId: string,
  input: {
    quantity: number;
    unitPrice: number;
    description?: string | null;
  }
) => Promise<Invoice>;

/**
 * Applies exactly one addInvoiceLine call. Never issues the invoice.
 */
export async function applyDraftInvoiceLineAdd(
  workspaceId: string,
  invoiceId: string,
  input: DraftInvoiceLineAddInput,
  addLine: AddInvoiceLineMutation
): Promise<Invoice> {
  const parsed = parseDraftInvoiceLineAddInput(input);
  return addLine(workspaceId, invoiceId, {
    quantity: parsed.quantity,
    unitPrice: parsed.unitPrice,
    description: parsed.description
  });
}

/**
 * Map Finance API / network failures for draft line add.
 * Conflict and NotFound close the editor and require a list refresh.
 * Validation and network stay in the editor; no auto-retry.
 */
export function interpretDraftInvoiceLineAddError(
  error: unknown
): DraftInvoiceLineAddFailure {
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
    message: i18n.t("invoices.error.lineAddFailed", { ns: "finance" }),
    keepEditorOpen: true,
    refreshList: false
  };
}
