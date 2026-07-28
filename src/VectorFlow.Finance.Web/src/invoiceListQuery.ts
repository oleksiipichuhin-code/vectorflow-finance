import { overdueQueueDueToDateInput } from "./invoiceDueDateAging.ts";

export type InvoiceStatusFilter = "" | "Draft" | "Issued";

/** Durable attention queue marker (URL `queue=overdue`). */
export type InvoiceQueueMode = "" | "overdue";

export type InvoiceListFilters = {
  documentNumber?: string;
  /** Exact counterparty reference (API Ordinal match after trim). */
  counterpartyReference?: string;
  status?: InvoiceStatusFilter;
  createdFromDate?: string;
  createdToDate?: string;
  /** Invoice issued-at date (YYYY-MM-DD) → issuedFromUtc inclusive start. */
  issuedFromDate?: string;
  /** Invoice issued-at date (YYYY-MM-DD) → issuedToUtc inclusive end. */
  issuedToDate?: string;
  /** Payment due date (YYYY-MM-DD) → dueFromUtc inclusive start. */
  dueFromDate?: string;
  /** Payment due date (YYYY-MM-DD) → dueToUtc inclusive end. */
  dueToDate?: string;
};

export type InvoiceListQuery = {
  page: number;
  pageSize: number;
  documentNumber?: string;
  counterpartyReference?: string;
  status?: "Draft" | "Issued";
  createdFromUtc?: string;
  createdToUtc?: string;
  issuedFromUtc?: string;
  issuedToUtc?: string;
  dueFromUtc?: string;
  dueToUtc?: string;
};

export const INVOICE_PAGE_SIZE = 5;

export const INVOICE_STATUS_OPTIONS: Array<"Draft" | "Issued"> = ["Draft", "Issued"];

export function dateInputToUtcStart(dateInput: string): string {
  return `${dateInput}T00:00:00.000Z`;
}

export function dateInputToUtcEnd(dateInput: string): string {
  return `${dateInput}T23:59:59.999Z`;
}

export function validateCreatedDateRange(fromDate: string, toDate: string): string | null {
  if (!fromDate || !toDate) {
    return null;
  }

  if (fromDate > toDate) {
    return "Дата «з» не може бути пізніше за дату «по».";
  }

  return null;
}

/** Same ordering rule as created-date range; used for issuedFrom/issuedTo inputs. */
export function validateIssuedDateRange(fromDate: string, toDate: string): string | null {
  if (!fromDate || !toDate) {
    return null;
  }

  if (fromDate > toDate) {
    return "Дата виставлення «з» не може бути пізніше за «по».";
  }

  return null;
}

/** Same ordering rule as created-date range; used for dueFrom/dueTo inputs. */
export function validateDueDateRange(fromDate: string, toDate: string): string | null {
  if (!fromDate || !toDate) {
    return null;
  }

  if (fromDate > toDate) {
    return "Строк оплати «з» не може бути пізніше за «по».";
  }

  return null;
}

/**
 * Resolve list filters for API query.
 * Overdue queue forces status=Issued and dueTo=local yesterday (inclusive dueToUtc excludes today).
 * Explicit dueToDate in filters is overridden while the queue is active so reload stays current.
 */
export function resolveInvoiceFiltersForQuery(
  filters: InvoiceListFilters,
  invoiceQueue: InvoiceQueueMode = "",
  now: Date = new Date()
): InvoiceListFilters {
  if (invoiceQueue !== "overdue") {
    return filters;
  }

  return {
    ...filters,
    status: "Issued",
    dueToDate: overdueQueueDueToDateInput(now)
  };
}

export function buildInvoiceListQuery(
  page: number,
  pageSize: number,
  filters: InvoiceListFilters,
  invoiceQueue: InvoiceQueueMode = "",
  now: Date = new Date()
): { query: InvoiceListQuery; validationError: string | null } {
  const resolved = resolveInvoiceFiltersForQuery(filters, invoiceQueue, now);
  const documentNumber = resolved.documentNumber?.trim() || undefined;
  const counterpartyReference = resolved.counterpartyReference?.trim() || undefined;
  const status =
    resolved.status === "Draft" || resolved.status === "Issued" ? resolved.status : undefined;
  const createdFromDate = resolved.createdFromDate?.trim() || undefined;
  const createdToDate = resolved.createdToDate?.trim() || undefined;
  const issuedFromDate = resolved.issuedFromDate?.trim() || undefined;
  const issuedToDate = resolved.issuedToDate?.trim() || undefined;
  const dueFromDate = resolved.dueFromDate?.trim() || undefined;
  const dueToDate = resolved.dueToDate?.trim() || undefined;

  const createdRangeError = validateCreatedDateRange(
    createdFromDate ?? "",
    createdToDate ?? ""
  );
  if (createdRangeError) {
    return {
      query: { page, pageSize },
      validationError: createdRangeError
    };
  }

  const issuedRangeError = validateIssuedDateRange(issuedFromDate ?? "", issuedToDate ?? "");
  if (issuedRangeError) {
    return {
      query: { page, pageSize },
      validationError: issuedRangeError
    };
  }

  const dueRangeError = validateDueDateRange(dueFromDate ?? "", dueToDate ?? "");
  if (dueRangeError) {
    return {
      query: { page, pageSize },
      validationError: dueRangeError
    };
  }

  const query: InvoiceListQuery = {
    page,
    pageSize
  };

  if (documentNumber) {
    query.documentNumber = documentNumber;
  }

  if (counterpartyReference) {
    query.counterpartyReference = counterpartyReference;
  }

  if (status) {
    query.status = status;
  }

  if (createdFromDate) {
    query.createdFromUtc = dateInputToUtcStart(createdFromDate);
  }

  if (createdToDate) {
    query.createdToUtc = dateInputToUtcEnd(createdToDate);
  }

  if (issuedFromDate) {
    query.issuedFromUtc = dateInputToUtcStart(issuedFromDate);
  }

  if (issuedToDate) {
    query.issuedToUtc = dateInputToUtcEnd(issuedToDate);
  }

  if (dueFromDate) {
    query.dueFromUtc = dateInputToUtcStart(dueFromDate);
  }

  if (dueToDate) {
    query.dueToUtc = dateInputToUtcEnd(dueToDate);
  }

  return { query, validationError: null };
}

export function hasActiveInvoiceFilters(filters: InvoiceListFilters): boolean {
  return Boolean(
    filters.documentNumber?.trim() ||
      filters.counterpartyReference?.trim() ||
      filters.status === "Draft" ||
      filters.status === "Issued" ||
      filters.createdFromDate?.trim() ||
      filters.createdToDate?.trim() ||
      filters.issuedFromDate?.trim() ||
      filters.issuedToDate?.trim() ||
      filters.dueFromDate?.trim() ||
      filters.dueToDate?.trim()
  );
}

export function isOverdueInvoiceQueue(invoiceQueue: InvoiceQueueMode | undefined): boolean {
  return invoiceQueue === "overdue";
}

export function hasActiveInvoiceDiscovery(
  filters: InvoiceListFilters,
  invoiceQueue: InvoiceQueueMode = ""
): boolean {
  return isOverdueInvoiceQueue(invoiceQueue) || hasActiveInvoiceFilters(filters);
}

export function totalPages(totalCount: number, pageSize: number): number {
  if (totalCount <= 0 || pageSize <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalCount / pageSize));
}
