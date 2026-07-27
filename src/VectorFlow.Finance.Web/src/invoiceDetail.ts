import type { Invoice, InvoiceLine } from "./api.ts";
import { canAddDraftInvoiceLine } from "./draftInvoiceLineAddEditor.ts";
import { canEditDraftInvoiceDueDate } from "./draftInvoiceDueDateEditor.ts";
import { canEditDraftInvoiceHeader } from "./draftInvoiceHeaderEditor.ts";
import { canRemoveDraftInvoiceLine } from "./draftInvoiceLineRemoveEditor.ts";
import { canUpdateDraftInvoiceLine } from "./draftInvoiceLineUpdateEditor.ts";
import { isDraftInvoice } from "./invoiceIssue.ts";
import { formatDate, formatMoney } from "./format.ts";

const VIEWABLE_STATUSES = new Set(["Draft", "Issued"]);

export function canViewInvoiceDetails(invoice: Pick<Invoice, "status">): boolean {
  return VIEWABLE_STATUSES.has(invoice.status);
}

/**
 * Lifecycle handoff from the read-only detail panel.
 * Composes existing row-action eligibility — does not invent new rules.
 */
export type InvoiceDetailLifecycleAction =
  | "editHeader"
  | "addLine"
  | "editDueDate"
  | "issue";

export function detailLifecycleActionsFor(
  invoice: Pick<Invoice, "status">
): InvoiceDetailLifecycleAction[] {
  const actions: InvoiceDetailLifecycleAction[] = [];
  if (canEditDraftInvoiceHeader(invoice)) {
    actions.push("editHeader");
  }
  if (canAddDraftInvoiceLine(invoice)) {
    actions.push("addLine");
  }
  if (canEditDraftInvoiceDueDate(invoice)) {
    actions.push("editDueDate");
  }
  if (isDraftInvoice(invoice)) {
    actions.push("issue");
  }
  return actions;
}

export function canEditInvoiceHeaderFromDetails(
  invoice: Pick<Invoice, "status">
): boolean {
  return detailLifecycleActionsFor(invoice).includes("editHeader");
}

export function canAddInvoiceLineFromDetails(
  invoice: Pick<Invoice, "status">
): boolean {
  return detailLifecycleActionsFor(invoice).includes("addLine");
}

export function canEditInvoiceDueDateFromDetails(
  invoice: Pick<Invoice, "status">
): boolean {
  return detailLifecycleActionsFor(invoice).includes("editDueDate");
}

export function canIssueInvoiceFromDetails(invoice: Pick<Invoice, "status">): boolean {
  return detailLifecycleActionsFor(invoice).includes("issue");
}

/** Per-line Draft controls in the detail line table — not invoice-level lifecycle actions. */
export function canUpdateInvoiceLineFromDetails(
  invoice: Pick<Invoice, "status">
): boolean {
  return canUpdateDraftInvoiceLine(invoice);
}

export function canRemoveInvoiceLineFromDetails(
  invoice: Pick<Invoice, "status">
): boolean {
  return canRemoveDraftInvoiceLine(invoice);
}

export type BeginEditorOptions = {
  /** Keep the open detail panel when launching an editor from it. */
  preserveDetail?: boolean;
};

export const DETAIL_RELOAD_AFTER_MUTATION_FAILED_MESSAGE =
  "Зміни збережено, але не вдалося оновити деталі. Натисніть «Спробувати знову».";

/**
 * After a successful issue mutation, reload detail when the same Invoice is open.
 */
export function shouldReloadDetailAfterMutation(
  detailTargetId: string | null | undefined,
  mutatedInvoiceId: string
): boolean {
  return Boolean(detailTargetId) && detailTargetId === mutatedInvoiceId;
}

export type InvoiceDetailLoadFailure = {
  kind: "not_found" | "retryable";
  message: string;
  refreshList: boolean;
  clearInvoiceData: boolean;
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

const INVOICE_NOT_FOUND_MESSAGE =
  "Рахунок більше недоступний. Список оновлено з сервера.";

const INVOICE_LOAD_FAILED_MESSAGE = "Не вдалося завантажити рахунок.";

/**
 * Map Invoice GET-by-id failures for the read-only detail panel.
 * 404 clears stale invoice data and refreshes the list.
 * Network / 5xx keep the panel open for retry without mutation.
 */
export function interpretInvoiceDetailLoadError(error: unknown): InvoiceDetailLoadFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        kind: "not_found",
        message: INVOICE_NOT_FOUND_MESSAGE,
        refreshList: true,
        clearInvoiceData: true
      };
    }

    return {
      kind: "retryable",
      message: apiFailure.message || INVOICE_LOAD_FAILED_MESSAGE,
      refreshList: false,
      clearInvoiceData: true
    };
  }

  if (error instanceof Error) {
    return {
      kind: "retryable",
      message: error.message || INVOICE_LOAD_FAILED_MESSAGE,
      refreshList: false,
      clearInvoiceData: true
    };
  }

  return {
    kind: "retryable",
    message: INVOICE_LOAD_FAILED_MESSAGE,
    refreshList: false,
    clearInvoiceData: true
  };
}

export type InvoiceDetailLineView = {
  id: string;
  sequence: number;
  descriptionDisplay: string;
  quantityDisplay: string;
  unitPriceDisplay: string;
  lineAmountDisplay: string;
};

export type InvoiceDetailFieldView = {
  documentNumber: string;
  status: string;
  counterpartyReference: string;
  amountDisplay: string;
  currency: string;
  dueDateDisplay: string;
  issuedAtDisplay: string;
  createdAtDisplay: string;
  updatedAtDisplay: string;
  invoiceId: string;
  lines: InvoiceDetailLineView[];
};

function formatQuantity(value: number): string {
  return Number.isFinite(value) ? String(value) : "—";
}

function toLineView(line: InvoiceLine, currency: string): InvoiceDetailLineView {
  return {
    id: line.id,
    sequence: line.sequence,
    descriptionDisplay: line.description?.trim() ? line.description : "—",
    quantityDisplay: formatQuantity(line.quantity),
    unitPriceDisplay: formatMoney(line.unitPrice, currency),
    lineAmountDisplay: formatMoney(line.lineAmount, currency)
  };
}

/** Build read-only display fields from authoritative Invoice DTO. */
export function buildInvoiceDetailFields(invoice: Invoice): InvoiceDetailFieldView {
  const lines = (invoice.lines ?? [])
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((line) => toLineView(line, invoice.currency));

  return {
    documentNumber: invoice.documentNumber,
    status: invoice.status,
    counterpartyReference: invoice.counterpartyReference,
    amountDisplay: formatMoney(invoice.totalAmount, invoice.currency),
    currency: invoice.currency,
    dueDateDisplay: formatDate(invoice.dueDateUtc),
    issuedAtDisplay: formatDate(invoice.issuedAtUtc),
    createdAtDisplay: formatDate(invoice.createdAtUtc),
    updatedAtDisplay: formatDate(invoice.updatedAtUtc),
    invoiceId: invoice.id,
    lines
  };
}
