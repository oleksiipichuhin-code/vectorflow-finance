export type AccrualStatusFilter = "" | "Draft" | "Recognized" | "Reversed";

export type AccrualListFilters = {
  descriptionPrefix?: string;
  status?: AccrualStatusFilter;
  recognitionFromDate?: string;
  recognitionToDate?: string;
};

export type AccrualListQuery = {
  page: number;
  pageSize: number;
  descriptionPrefix?: string;
  status?: "Draft" | "Recognized" | "Reversed";
  recognitionFromUtc?: string;
  recognitionToUtc?: string;
};

export const ACCRUAL_PAGE_SIZE = 5;

export const ACCRUAL_STATUS_OPTIONS: Array<"Draft" | "Recognized" | "Reversed"> = [
  "Draft",
  "Recognized",
  "Reversed"
];

export function dateInputToUtcStart(dateInput: string): string {
  return `${dateInput}T00:00:00.000Z`;
}

export function dateInputToUtcEnd(dateInput: string): string {
  return `${dateInput}T23:59:59.999Z`;
}

export function validateRecognitionDateRange(
  fromDate: string,
  toDate: string
): string | null {
  if (!fromDate || !toDate) {
    return null;
  }

  if (fromDate > toDate) {
    return "Дата «з» не може бути пізніше за дату «по».";
  }

  return null;
}

export function buildAccrualListQuery(
  page: number,
  pageSize: number,
  filters: AccrualListFilters
): { query: AccrualListQuery; validationError: string | null } {
  const descriptionPrefix = filters.descriptionPrefix?.trim() || undefined;
  const status =
    filters.status === "Draft" ||
    filters.status === "Recognized" ||
    filters.status === "Reversed"
      ? filters.status
      : undefined;
  const recognitionFromDate = filters.recognitionFromDate?.trim() || undefined;
  const recognitionToDate = filters.recognitionToDate?.trim() || undefined;

  const validationError = validateRecognitionDateRange(
    recognitionFromDate ?? "",
    recognitionToDate ?? ""
  );

  if (validationError) {
    return {
      query: { page, pageSize },
      validationError
    };
  }

  const query: AccrualListQuery = {
    page,
    pageSize
  };

  if (descriptionPrefix) {
    query.descriptionPrefix = descriptionPrefix;
  }

  if (status) {
    query.status = status;
  }

  if (recognitionFromDate) {
    query.recognitionFromUtc = dateInputToUtcStart(recognitionFromDate);
  }

  if (recognitionToDate) {
    query.recognitionToUtc = dateInputToUtcEnd(recognitionToDate);
  }

  return { query, validationError: null };
}

export function hasActiveAccrualFilters(filters: AccrualListFilters): boolean {
  return Boolean(
    filters.descriptionPrefix?.trim() ||
      filters.status === "Draft" ||
      filters.status === "Recognized" ||
      filters.status === "Reversed" ||
      filters.recognitionFromDate?.trim() ||
      filters.recognitionToDate?.trim()
  );
}

export function totalPages(totalCount: number, pageSize: number): number {
  if (totalCount <= 0 || pageSize <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalCount / pageSize));
}
