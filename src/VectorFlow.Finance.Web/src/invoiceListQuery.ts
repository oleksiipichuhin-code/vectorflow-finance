export type InvoiceStatusFilter = "" | "Draft" | "Issued";

export type InvoiceListFilters = {
  documentNumber?: string;
  status?: InvoiceStatusFilter;
  createdFromDate?: string;
  createdToDate?: string;
  /** Payment due date (YYYY-MM-DD) → dueFromUtc inclusive start. */
  dueFromDate?: string;
  /** Payment due date (YYYY-MM-DD) → dueToUtc inclusive end. */
  dueToDate?: string;
};

export type InvoiceListQuery = {
  page: number;
  pageSize: number;
  documentNumber?: string;
  status?: "Draft" | "Issued";
  createdFromUtc?: string;
  createdToUtc?: string;
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

export function buildInvoiceListQuery(
  page: number,
  pageSize: number,
  filters: InvoiceListFilters
): { query: InvoiceListQuery; validationError: string | null } {
  const documentNumber = filters.documentNumber?.trim() || undefined;
  const status =
    filters.status === "Draft" || filters.status === "Issued" ? filters.status : undefined;
  const createdFromDate = filters.createdFromDate?.trim() || undefined;
  const createdToDate = filters.createdToDate?.trim() || undefined;
  const dueFromDate = filters.dueFromDate?.trim() || undefined;
  const dueToDate = filters.dueToDate?.trim() || undefined;

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

  if (status) {
    query.status = status;
  }

  if (createdFromDate) {
    query.createdFromUtc = dateInputToUtcStart(createdFromDate);
  }

  if (createdToDate) {
    query.createdToUtc = dateInputToUtcEnd(createdToDate);
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
      filters.status === "Draft" ||
      filters.status === "Issued" ||
      filters.createdFromDate?.trim() ||
      filters.createdToDate?.trim() ||
      filters.dueFromDate?.trim() ||
      filters.dueToDate?.trim()
  );
}

export function totalPages(totalCount: number, pageSize: number): number {
  if (totalCount <= 0 || pageSize <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalCount / pageSize));
}
