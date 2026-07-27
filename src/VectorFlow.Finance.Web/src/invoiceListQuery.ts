export type InvoiceStatusFilter = "" | "Draft" | "Issued";

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

export function buildInvoiceListQuery(
  page: number,
  pageSize: number,
  filters: InvoiceListFilters
): { query: InvoiceListQuery; validationError: string | null } {
  const documentNumber = filters.documentNumber?.trim() || undefined;
  const counterpartyReference = filters.counterpartyReference?.trim() || undefined;
  const status =
    filters.status === "Draft" || filters.status === "Issued" ? filters.status : undefined;
  const createdFromDate = filters.createdFromDate?.trim() || undefined;
  const createdToDate = filters.createdToDate?.trim() || undefined;
  const issuedFromDate = filters.issuedFromDate?.trim() || undefined;
  const issuedToDate = filters.issuedToDate?.trim() || undefined;
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

export function totalPages(totalCount: number, pageSize: number): number {
  if (totalCount <= 0 || pageSize <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalCount / pageSize));
}
