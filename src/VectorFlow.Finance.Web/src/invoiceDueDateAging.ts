/**
 * Honest due-date aging for Issued invoices.
 * Classifies calendar due date only — never payment/settlement status.
 */

export type DueDateAgingKind = "overdue" | "due_today" | "not_due_yet" | "no_due_date";

export type DueDateAging = {
  kind: DueDateAgingKind;
  /** Short Ukrainian label for list/detail badges. */
  label: string;
  /**
   * Days relative to today:
   * - overdue: days past due (positive)
   * - due_today: 0
   * - not_due_yet: days until due (positive)
   * - no_due_date: null
   */
  dayOffset: number | null;
  dayOffsetLabel: string;
  /** Explicit non-payment wording for detail. */
  explanation: string;
};

const AGING_EXPLANATION =
  "Статус визначено за строком оплати. Дані про фактичну оплату в системі відсутні.";

/** Local calendar YYYY-MM-DD for the given instant (user timezone). */
export function localCalendarDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Intentional due calendar day as stored by the product (UTC midnight of YYYY-MM-DD).
 * Falls back to UTC date components for non-standard ISO values.
 */
export function dueDateCalendarString(dueDateUtc: string | null | undefined): string | null {
  if (dueDateUtc == null) {
    return null;
  }

  const trimmed = dueDateUtc.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Yesterday on the user's local calendar (YYYY-MM-DD). */
export function localCalendarYesterdayString(now: Date = new Date()): string {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return localCalendarDateString(yesterday);
}

/** Whole-day difference between two YYYY-MM-DD labels (b − a), DST-safe via UTC midnights. */
export function calendarDayDiff(fromDate: string, toDate: string): number {
  const fromMs = Date.parse(`${fromDate}T00:00:00.000Z`);
  const toMs = Date.parse(`${toDate}T00:00:00.000Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return 0;
  }

  return Math.round((toMs - fromMs) / 86_400_000);
}

function dayOffsetLabelFor(kind: DueDateAgingKind, dayOffset: number | null): string {
  if (kind === "no_due_date" || dayOffset == null) {
    return "—";
  }

  if (kind === "due_today") {
    return "0 днів";
  }

  if (kind === "overdue") {
    if (dayOffset === 1) {
      return "1 день прострочення";
    }
    return `${dayOffset} днів прострочення`;
  }

  if (dayOffset === 1) {
    return "через 1 день";
  }
  return `через ${dayOffset} днів`;
}

/**
 * Compare due date calendar day to the user's local calendar day.
 * A due date equal to today is never overdue mid-day (calendar, not clock).
 */
export function classifyDueDateAging(
  dueDateUtc: string | null | undefined,
  now: Date = new Date()
): DueDateAging {
  const dueDay = dueDateCalendarString(dueDateUtc);
  if (!dueDay) {
    return {
      kind: "no_due_date",
      label: "Немає строку",
      dayOffset: null,
      dayOffsetLabel: "—",
      explanation: AGING_EXPLANATION
    };
  }

  const today = localCalendarDateString(now);
  const diffFromDueToToday = calendarDayDiff(dueDay, today);

  if (diffFromDueToToday > 0) {
    return {
      kind: "overdue",
      label: "Прострочено",
      dayOffset: diffFromDueToToday,
      dayOffsetLabel: dayOffsetLabelFor("overdue", diffFromDueToToday),
      explanation: AGING_EXPLANATION
    };
  }

  if (diffFromDueToToday === 0) {
    return {
      kind: "due_today",
      label: "Строк сьогодні",
      dayOffset: 0,
      dayOffsetLabel: dayOffsetLabelFor("due_today", 0),
      explanation: AGING_EXPLANATION
    };
  }

  const daysUntil = -diffFromDueToToday;
  return {
    kind: "not_due_yet",
    label: "Строк не настав",
    dayOffset: daysUntil,
    dayOffsetLabel: dayOffsetLabelFor("not_due_yet", daysUntil),
    explanation: AGING_EXPLANATION
  };
}

/**
 * Inclusive dueToUtc upper bound for overdue-only queries.
 * Backend: dueDate <= dueToUtc. End of yesterday excludes today's calendar due dates
 * stored as todayT00:00:00.000Z.
 */
export function overdueQueueDueToDateInput(now: Date = new Date()): string {
  return localCalendarYesterdayString(now);
}

/**
 * Inclusive dueToUtc upper bound for payment collection workspace.
 * Includes overdue and due-today Issued invoices (calendar due date ≤ local today).
 */
export function collectionsQueueDueToDateInput(now: Date = new Date()): string {
  return localCalendarDateString(now);
}
