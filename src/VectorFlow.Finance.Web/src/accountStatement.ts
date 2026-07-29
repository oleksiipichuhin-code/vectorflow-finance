import {
  dateInputToUtcEnd,
  dateInputToUtcStart,
  validateRecognitionDateRange
} from "./accrualListQuery.ts";

export type StatementPeriodFilters = {
  periodFromDate: string;
  periodToDate: string;
};

export type StatementPeriodQuery = {
  periodFromUtc?: string;
  periodToUtc?: string;
};

export const EMPTY_STATEMENT_PERIOD: StatementPeriodFilters = {
  periodFromDate: "",
  periodToDate: ""
};

/** Reuse accrual range validation copy for statement period inputs. */
export function validateStatementPeriodRange(
  fromDate: string,
  toDate: string
): string | null {
  return validateRecognitionDateRange(fromDate, toDate);
}

export function buildStatementPeriodQuery(
  filters: StatementPeriodFilters
): { query: StatementPeriodQuery; validationError: string | null } {
  const periodFromDate = filters.periodFromDate?.trim() || "";
  const periodToDate = filters.periodToDate?.trim() || "";

  const validationError = validateStatementPeriodRange(periodFromDate, periodToDate);
  if (validationError) {
    return { query: {}, validationError };
  }

  const query: StatementPeriodQuery = {};
  if (periodFromDate) {
    query.periodFromUtc = dateInputToUtcStart(periodFromDate);
  }
  if (periodToDate) {
    query.periodToUtc = dateInputToUtcEnd(periodToDate);
  }

  return { query, validationError: null };
}

export function hasActiveStatementPeriod(filters: StatementPeriodFilters): boolean {
  return Boolean(filters.periodFromDate?.trim() || filters.periodToDate?.trim());
}
