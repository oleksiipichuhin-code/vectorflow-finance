import {
  dateInputToUtcEnd,
  dateInputToUtcStart,
  validateRecognitionDateRange
} from "./accrualListQuery.ts";
import type { LedgerPosting } from "./api.ts";

export type LedgerPostedPeriodFilters = {
  postedFromDate: string;
  postedToDate: string;
};

export const EMPTY_LEDGER_POSTED_PERIOD: LedgerPostedPeriodFilters = {
  postedFromDate: "",
  postedToDate: ""
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reuse accrual range validation copy for ledger posted-at filters. */
export function validateLedgerPostedPeriodRange(
  fromDate: string,
  toDate: string
): string | null {
  return validateRecognitionDateRange(fromDate, toDate);
}

export function hasActiveLedgerPostedPeriod(filters: LedgerPostedPeriodFilters): boolean {
  return Boolean(filters.postedFromDate?.trim() || filters.postedToDate?.trim());
}

export function parseSourceJournalEntryIdFilter(
  value: string | null | undefined
): string {
  if (value == null) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : "";
}

export function isLedgerPostingId(value: string | null | undefined): boolean {
  if (value == null) {
    return false;
  }

  const trimmed = value.trim();
  return UUID_RE.test(trimmed);
}

/**
 * Client-side filter over workspace ledger postings (API list has no query params).
 * Matches inclusive UTC day bounds and optional exact source journal entry id.
 */
export function filterLedgerPostings(
  postings: ReadonlyArray<LedgerPosting>,
  filters: LedgerPostedPeriodFilters,
  sourceJournalEntryId: string
): { items: LedgerPosting[]; validationError: string | null } {
  const postedFromDate = filters.postedFromDate?.trim() || "";
  const postedToDate = filters.postedToDate?.trim() || "";
  const validationError = validateLedgerPostedPeriodRange(postedFromDate, postedToDate);
  if (validationError) {
    return { items: [], validationError };
  }

  const journalFilter = parseSourceJournalEntryIdFilter(sourceJournalEntryId);
  const fromMs = postedFromDate ? Date.parse(dateInputToUtcStart(postedFromDate)) : null;
  const toMs = postedToDate ? Date.parse(dateInputToUtcEnd(postedToDate)) : null;

  const items = postings.filter((posting) => {
    if (journalFilter && posting.journalEntryId.toLowerCase() !== journalFilter) {
      return false;
    }

    const postedMs = Date.parse(posting.postedAtUtc);
    if (!Number.isFinite(postedMs)) {
      return false;
    }

    if (fromMs != null && postedMs < fromMs) {
      return false;
    }

    if (toMs != null && postedMs > toMs) {
      return false;
    }

    return true;
  });

  return { items, validationError: null };
}
