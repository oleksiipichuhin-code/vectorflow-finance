/**
 * Collection reminders / follow-up scheduling (browser-local).
 * Stored on PromiseToPayRecord.reminders — same localStorage key.
 * Independent of contact nextFollowUpAt; operational collector tasks only.
 */

import { calendarDayDiff, localCalendarDateString } from "./invoiceDueDateAging.ts";

export type ReminderKind =
  | "callback"
  | "check_payment"
  | "send_documents"
  | "internal_review"
  | "other";

export type ReminderStatus = "open" | "completed" | "cancelled";

export type CollectionReminder = {
  id: string;
  title: string;
  note: string;
  kind: ReminderKind;
  dueDate: string;
  status: ReminderStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc: string | null;
  cancelledAtUtc: string | null;
};

export type CollectionReminderInput = {
  title?: string;
  note?: string;
  kind?: ReminderKind | "";
  dueDate?: string;
};

export type CollectionReminderUpdateInput = CollectionReminderInput & {
  reminderId: string;
};

export type CollectionReminderValidationResult =
  | {
      ok: true;
      title: string;
      note: string;
      kind: ReminderKind;
      dueDate: string;
    }
  | { ok: false; error: string };

export const REMINDER_KIND_OPTIONS: readonly {
  id: ReminderKind;
  label: string;
}[] = [
  { id: "callback", label: "Callback" },
  { id: "check_payment", label: "Check payment" },
  { id: "send_documents", label: "Send documents" },
  { id: "internal_review", label: "Internal review" },
  { id: "other", label: "Other" }
];

const KIND_SET: ReadonlySet<string> = new Set(
  REMINDER_KIND_OPTIONS.map((option) => option.id)
);

const STATUS_SET: ReadonlySet<string> = new Set([
  "open",
  "completed",
  "cancelled"
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TITLE_MAX = 200;
const NOTE_MAX = 2000;

export function parseReminderKind(
  value: string | null | undefined
): ReminderKind | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return KIND_SET.has(trimmed) ? (trimmed as ReminderKind) : null;
}

export function reminderKindLabel(kind: ReminderKind): string {
  return REMINDER_KIND_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
}

export function reminderStatusLabel(status: ReminderStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function isValidReminderDate(value: string | null | undefined): boolean {
  if (value == null) {
    return false;
  }
  const trimmed = value.trim();
  if (!DATE_RE.test(trimmed)) {
    return false;
  }
  const ms = Date.parse(`${trimmed}T00:00:00.000Z`);
  return Number.isFinite(ms);
}

export function isOpenCollectionReminder(
  reminder: CollectionReminder | null | undefined
): boolean {
  return Boolean(reminder && reminder.status === "open");
}

export function listOpenCollectionReminders(
  reminders: readonly CollectionReminder[] | null | undefined
): CollectionReminder[] {
  if (!reminders?.length) {
    return [];
  }
  return reminders.filter((reminder) => isOpenCollectionReminder(reminder));
}

export function countOpenCollectionReminders(
  reminders: readonly CollectionReminder[] | null | undefined
): number {
  return listOpenCollectionReminders(reminders).length;
}

/** Days until due (positive), past due (negative), or 0 = due today. */
export function daysRelativeToReminderDue(
  dueDate: string,
  now: Date = new Date()
): number | null {
  if (!isValidReminderDate(dueDate)) {
    return null;
  }
  return calendarDayDiff(localCalendarDateString(now), dueDate.trim());
}

export function isReminderDueOrOverdue(
  reminder: CollectionReminder | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isOpenCollectionReminder(reminder)) {
    return false;
  }
  const relative = daysRelativeToReminderDue(reminder!.dueDate, now);
  return relative != null && relative <= 0;
}

export function hasDueOpenReminders(
  reminders: readonly CollectionReminder[] | null | undefined,
  now: Date = new Date()
): boolean {
  return listOpenCollectionReminders(reminders).some((reminder) =>
    isReminderDueOrOverdue(reminder, now)
  );
}

/** Earliest open reminder by due date, then id. */
export function selectNextOpenReminder(
  reminders: readonly CollectionReminder[] | null | undefined,
  now: Date = new Date()
): CollectionReminder | null {
  const open = listOpenCollectionReminders(reminders);
  if (open.length === 0) {
    return null;
  }
  return open.slice().sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    // Prefer due/overdue first when dates equal (stable by id).
    const aDue = isReminderDueOrOverdue(a, now) ? 0 : 1;
    const bDue = isReminderDueOrOverdue(b, now) ? 0 : 1;
    if (aDue !== bDue) {
      return aDue - bDue;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

/** Open first (due/overdue before future), then newest updated. */
export function sortCollectionRemindersForDisplay(
  reminders: readonly CollectionReminder[],
  now: Date = new Date()
): CollectionReminder[] {
  return reminders.slice().sort((a, b) => {
    const aOpen = isOpenCollectionReminder(a) ? 0 : 1;
    const bOpen = isOpenCollectionReminder(b) ? 0 : 1;
    if (aOpen !== bOpen) {
      return aOpen - bOpen;
    }
    if (a.status === "open" && b.status === "open") {
      if (a.dueDate !== b.dueDate) {
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      const aDue = isReminderDueOrOverdue(a, now) ? 0 : 1;
      const bDue = isReminderDueOrOverdue(b, now) ? 0 : 1;
      if (aDue !== bDue) {
        return aDue - bDue;
      }
    }
    if (a.updatedAtUtc !== b.updatedAtUtc) {
      return a.updatedAtUtc < b.updatedAtUtc ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function validateCollectionReminderInput(
  input: CollectionReminderInput
): CollectionReminderValidationResult {
  const title = (input.title ?? "").trim();
  if (!title) {
    return { ok: false, error: "Заголовок нагадування обовʼязковий." };
  }
  if (title.length > TITLE_MAX) {
    return {
      ok: false,
      error: `Заголовок занадто довгий (макс. ${TITLE_MAX} символів).`
    };
  }

  const note = (input.note ?? "").trim();
  if (note.length > NOTE_MAX) {
    return {
      ok: false,
      error: `Нотатка нагадування занадто довга (макс. ${NOTE_MAX} символів).`
    };
  }

  const kindRaw = input.kind ?? "";
  const kind = kindRaw === "" ? null : parseReminderKind(String(kindRaw));
  if (!kind) {
    return { ok: false, error: "Оберіть тип нагадування." };
  }

  const dueDate = (input.dueDate ?? "").trim();
  if (!dueDate) {
    return { ok: false, error: "Дата нагадування обовʼязкова." };
  }
  if (!isValidReminderDate(dueDate)) {
    return {
      ok: false,
      error: "Некоректна дата нагадування. Використовуйте формат РРРР-ММ-ДД."
    };
  }

  return { ok: true, title, note, kind, dueDate };
}

export function createReminderId(invoiceId: string, now: Date): string {
  return `reminder|${invoiceId.trim().toLowerCase()}|${now.toISOString()}`;
}

export function createCollectionReminderEntity(
  invoiceId: string,
  validated: Extract<CollectionReminderValidationResult, { ok: true }>,
  now: Date = new Date()
): CollectionReminder {
  const at = now.toISOString();
  return {
    id: createReminderId(invoiceId, now),
    title: validated.title,
    note: validated.note,
    kind: validated.kind,
    dueDate: validated.dueDate,
    status: "open",
    createdAtUtc: at,
    updatedAtUtc: at,
    completedAtUtc: null,
    cancelledAtUtc: null
  };
}

export function sanitizeCollectionReminder(raw: unknown): CollectionReminder | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  if (!title || title.length > TITLE_MAX) {
    return null;
  }
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  if (note.length > NOTE_MAX) {
    return null;
  }
  const kind = parseReminderKind(
    typeof candidate.kind === "string" ? candidate.kind : null
  );
  if (!kind) {
    return null;
  }
  const dueDate =
    typeof candidate.dueDate === "string" ? candidate.dueDate.trim() : "";
  if (!isValidReminderDate(dueDate)) {
    return null;
  }
  const statusRaw =
    typeof candidate.status === "string" ? candidate.status.trim() : "";
  if (!STATUS_SET.has(statusRaw)) {
    return null;
  }
  const status = statusRaw as ReminderStatus;
  const createdAtUtc =
    typeof candidate.createdAtUtc === "string" && candidate.createdAtUtc.trim()
      ? candidate.createdAtUtc.trim()
      : new Date(0).toISOString();
  const updatedAtUtc =
    typeof candidate.updatedAtUtc === "string" && candidate.updatedAtUtc.trim()
      ? candidate.updatedAtUtc.trim()
      : createdAtUtc;
  const completedRaw =
    typeof candidate.completedAtUtc === "string"
      ? candidate.completedAtUtc.trim()
      : "";
  const cancelledRaw =
    typeof candidate.cancelledAtUtc === "string"
      ? candidate.cancelledAtUtc.trim()
      : "";
  return {
    id,
    title,
    note,
    kind,
    dueDate,
    status,
    createdAtUtc,
    updatedAtUtc,
    completedAtUtc:
      status === "completed" ? completedRaw || updatedAtUtc : null,
    cancelledAtUtc:
      status === "cancelled" ? cancelledRaw || updatedAtUtc : null
  };
}

export function sanitizeCollectionReminders(raw: unknown): CollectionReminder[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const reminders: CollectionReminder[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const reminder = sanitizeCollectionReminder(item);
    if (!reminder || seen.has(reminder.id)) {
      continue;
    }
    seen.add(reminder.id);
    reminders.push(reminder);
  }
  return reminders;
}

export function summarizeReminderForHistory(reminder: CollectionReminder): string {
  const preview = reminder.note
    ? reminder.note.length > 80
      ? `${reminder.note.slice(0, 77)}…`
      : reminder.note
    : reminder.title;
  return `${reminderKindLabel(reminder.kind)} · ${reminder.title} · due ${reminder.dueDate} — ${preview}`;
}
