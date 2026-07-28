/**
 * Promise-to-pay follow-up + collection resolution workflow (browser-local persistence).
 * Keys are stable invoice ids — never row index or display number alone.
 * No server collection/follow-up contract exists yet.
 */

import {
  calendarDayDiff,
  dueDateCalendarString,
  localCalendarDateString
} from "./invoiceDueDateAging.ts";
import {
  historyAfterContact,
  historyAfterPromiseSave,
  historyAfterResolution,
  historyAfterStatusChange,
  parseContactChannel,
  parseContactResult,
  sanitizeActivityHistory,
  type CollectionActivityEvent,
  type ContactChannel,
  type ContactResult
} from "./collectionCaseHistory.ts";

export const PROMISE_STORAGE_KEY_PREFIX = "vectorflow.finance.promiseToPay.";

export type PromiseFollowUpStatus =
  | "awaiting"
  | "follow_up_required"
  | "contacted"
  | "completed";

export type CollectionResolutionKind =
  | "paid"
  | "partially_paid"
  | "new_promise"
  | "disputed"
  | "escalated"
  | "unable_to_contact";

/** Classification groups for the Promise Follow-ups workspace. */
export type PromiseGroupId =
  | "due_today"
  | "upcoming"
  | "broken"
  | "follow_up_required"
  | "completed"
  | "disputed"
  | "escalated";

export type PromiseGroupFilter = "" | PromiseGroupId;

export type CollectionResolution = {
  kind: CollectionResolutionKind;
  resolvedAtUtc: string;
  paymentDate: string | null;
  paidAmount: number | null;
  remainingAmount: number | null;
  reason: string | null;
  note: string;
};

export type CollectionContactAttempt = {
  channel: ContactChannel;
  result: ContactResult;
  note: string;
  followUpAt: string | null;
  contactedAtUtc: string;
};

export type PromiseToPayRecord = {
  invoiceId: string;
  promiseDate: string;
  note: string;
  status: PromiseFollowUpStatus;
  updatedAtUtc: string;
  completedAtUtc: string | null;
  resolution: CollectionResolution | null;
  /** Optional next contact follow-up calendar date (YYYY-MM-DD). */
  nextFollowUpAt: string | null;
  /** Most recent logged contact attempt. */
  lastContact: CollectionContactAttempt | null;
  /** Append-only activity timeline (same localStorage record). */
  history: CollectionActivityEvent[];
};

export type PromiseToPayInput = {
  promiseDate: string;
  note?: string;
};

export type PromiseValidationResult =
  | { ok: true; promiseDate: string; note: string }
  | { ok: false; error: string };

export type CollectionResolutionInput = {
  kind: CollectionResolutionKind;
  paymentDate?: string;
  paidAmount?: string | number;
  remainingAmount?: string | number;
  promiseDate?: string;
  reason?: string;
  note?: string;
};

export type CollectionContactInput = {
  channel: ContactChannel | "";
  result: ContactResult | "";
  note?: string;
  followUpAt?: string;
};

export type ContactValidationResult =
  | {
      ok: true;
      channel: ContactChannel;
      result: ContactResult;
      note: string;
      followUpAt: string | null;
      needsPromise: boolean;
    }
  | { ok: false; error: string };

export type PromiseInvoiceLike = {
  id: string;
  documentNumber: string;
  counterpartyReference: string;
  dueDateUtc: string | null;
  totalAmount: number;
  currency: string;
};

export type PromiseFollowUpItem = {
  invoiceId: string;
  documentNumber: string;
  counterpartyReference: string;
  overdueAmount: number;
  currency: string;
  originalDueDate: string | null;
  promiseDate: string;
  /** Prefer contact follow-up date when set; otherwise promise date. */
  nextActionDate: string;
  /** Days until promise (positive) or days past promise (negative). 0 = due today. */
  daysRelativeToPromise: number;
  daysRelativeLabel: string;
  group: PromiseGroupId;
  groupLabel: string;
  status: PromiseFollowUpStatus;
  statusLabel: string;
  note: string;
  completedAtUtc: string | null;
  resolution: CollectionResolution | null;
  resolutionLabel: string | null;
  nextFollowUpAt: string | null;
  lastContact: CollectionContactAttempt | null;
};

export type PromiseFollowUpSummary = {
  dueTodayCount: number;
  brokenCount: number;
  followUpRequiredCount: number;
  completedCount: number;
  resolvedTodayCount: number;
  escalatedCount: number;
  disputedCount: number;
  /** Amounts by currency for active (non-completed / non-terminal) promises. */
  promisedTotalsByCurrency: { currency: string; amount: number }[];
};

export type PromiseGroupOption = {
  id: PromiseGroupFilter;
  label: string;
  shortLabel: string;
};

export const RESOLUTION_KIND_OPTIONS: readonly {
  id: CollectionResolutionKind;
  label: string;
}[] = [
  { id: "paid", label: "Paid" },
  { id: "partially_paid", label: "Partially Paid" },
  { id: "new_promise", label: "New Promise" },
  { id: "disputed", label: "Disputed" },
  { id: "escalated", label: "Escalated" },
  { id: "unable_to_contact", label: "Unable to Contact" }
];

export const PROMISE_GROUP_OPTIONS: readonly PromiseGroupOption[] = [
  { id: "", label: "Усі follow-ups", shortLabel: "Усі" },
  { id: "due_today", label: "Due today", shortLabel: "Due today" },
  { id: "upcoming", label: "Upcoming", shortLabel: "Upcoming" },
  { id: "broken", label: "Broken promises", shortLabel: "Broken" },
  { id: "follow_up_required", label: "Follow-up required", shortLabel: "Follow-up" },
  { id: "disputed", label: "Disputed", shortLabel: "Disputed" },
  { id: "escalated", label: "Escalated", shortLabel: "Escalated" },
  { id: "completed", label: "Completed recently", shortLabel: "Completed" }
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_SET: ReadonlySet<string> = new Set([
  "awaiting",
  "follow_up_required",
  "contacted",
  "completed"
]);

const RESOLUTION_KIND_SET: ReadonlySet<string> = new Set([
  "paid",
  "partially_paid",
  "new_promise",
  "disputed",
  "escalated",
  "unable_to_contact"
]);

const COMPLETED_RECENT_DAYS = 14;

const GROUP_IDS: readonly PromiseGroupId[] = [
  "due_today",
  "upcoming",
  "broken",
  "follow_up_required",
  "completed",
  "disputed",
  "escalated"
];

export function storageKeyForInvoice(invoiceId: string): string {
  return `${PROMISE_STORAGE_KEY_PREFIX}${invoiceId.trim().toLowerCase()}`;
}

export function isValidPromiseDate(value: string | null | undefined): boolean {
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

export function validatePromiseToPayInput(input: PromiseToPayInput): PromiseValidationResult {
  const rawDate = input.promiseDate?.trim() ?? "";
  if (!rawDate) {
    return { ok: false, error: "Вкажіть обіцяну дату оплати." };
  }
  if (!isValidPromiseDate(rawDate)) {
    return { ok: false, error: "Некоректна дата обіцянки. Використовуйте формат РРРР-ММ-ДД." };
  }
  const note = (input.note ?? "").trim();
  return { ok: true, promiseDate: rawDate, note };
}

export function validateCollectionContactInput(
  input: CollectionContactInput
): ContactValidationResult {
  const channel = parseContactChannel(input.channel);
  const result = parseContactResult(input.result);
  const note = (input.note ?? "").trim();
  const followUpRaw = (input.followUpAt ?? "").trim();

  if (!channel && !result && !note && !followUpRaw) {
    return { ok: false, error: "Заповніть канал або результат контакту." };
  }
  if (!channel) {
    return { ok: false, error: "Оберіть канал контакту." };
  }
  if (!result) {
    return { ok: false, error: "Оберіть результат контакту." };
  }
  if (followUpRaw && !isValidPromiseDate(followUpRaw)) {
    return {
      ok: false,
      error: "Некоректна дата follow-up. Використовуйте формат РРРР-ММ-ДД."
    };
  }

  return {
    ok: true,
    channel,
    result,
    note,
    followUpAt: followUpRaw || null,
    needsPromise: result === "payment_promised"
  };
}

export function parsePromiseGroupParam(value: string | null | undefined): PromiseGroupFilter {
  if (value == null) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return (GROUP_IDS as readonly string[]).includes(trimmed)
    ? (trimmed as PromiseGroupId)
    : "";
}

export function promiseGroupLabel(group: PromiseGroupFilter): string {
  return PROMISE_GROUP_OPTIONS.find((option) => option.id === group)?.label ?? "Усі follow-ups";
}

export function promiseStatusLabel(status: PromiseFollowUpStatus): string {
  switch (status) {
    case "awaiting":
      return "Очікується";
    case "follow_up_required":
      return "Потрібен повторний контакт";
    case "contacted":
      return "Контакт виконано";
    case "completed":
      return "Завершено";
    default:
      return status;
  }
}

export function resolutionKindLabel(kind: CollectionResolutionKind): string {
  return RESOLUTION_KIND_OPTIONS.find((option) => option.id === kind)?.label ?? kind;
}

export function daysRelativeToPromiseDate(
  promiseDate: string,
  now: Date = new Date()
): number | null {
  if (!isValidPromiseDate(promiseDate)) {
    return null;
  }
  const today = localCalendarDateString(now);
  // positive = days until promise; negative = days past; 0 = today
  return calendarDayDiff(today, promiseDate.trim());
}

export function daysRelativeLabel(days: number): string {
  if (days === 0) {
    return "сьогодні";
  }
  if (days > 0) {
    return days === 1 ? "через 1 день" : `через ${days} днів`;
  }
  const past = -days;
  return past === 1 ? "1 день прострочення" : `${past} днів прострочення`;
}

function isRecentCompleted(completedAtUtc: string | null | undefined, now: Date): boolean {
  if (!completedAtUtc) {
    return true;
  }
  const completedDay = dueDateCalendarString(completedAtUtc);
  if (!completedDay) {
    return true;
  }
  const age = calendarDayDiff(completedDay, localCalendarDateString(now));
  return age >= 0 && age <= COMPLETED_RECENT_DAYS;
}

function classifyByPromiseDate(
  promiseDate: string,
  now: Date
): PromiseGroupId | null {
  const relative = daysRelativeToPromiseDate(promiseDate, now);
  if (relative == null) {
    return null;
  }
  if (relative < 0) {
    return "broken";
  }
  if (relative === 0) {
    return "due_today";
  }
  return "upcoming";
}

/**
 * Classify an active or completed promise into a follow-up workspace group.
 * Resolution outcomes take precedence over calendar buckets where specified.
 * Contact nextFollowUpAt places the case in follow_up_required when active.
 */
export function classifyPromiseGroup(
  record: Pick<
    PromiseToPayRecord,
    "promiseDate" | "status" | "completedAtUtc" | "resolution" | "nextFollowUpAt"
  >,
  now: Date = new Date()
): PromiseGroupId | null {
  const resolution = record.resolution;

  if (resolution?.kind === "paid") {
    return isRecentCompleted(resolution.resolvedAtUtc ?? record.completedAtUtc, now)
      ? "completed"
      : null;
  }

  if (resolution?.kind === "disputed") {
    return "disputed";
  }

  if (resolution?.kind === "escalated") {
    return "escalated";
  }

  if (resolution?.kind === "unable_to_contact") {
    return "follow_up_required";
  }

  if (record.status === "completed") {
    return isRecentCompleted(record.completedAtUtc, now) ? "completed" : null;
  }

  if (record.status === "follow_up_required" || record.nextFollowUpAt) {
    return "follow_up_required";
  }

  if (resolution?.kind === "new_promise" || resolution?.kind === "partially_paid") {
    return classifyByPromiseDate(record.promiseDate, now);
  }

  return classifyByPromiseDate(record.promiseDate, now);
}

function sanitizeContactAttempt(raw: unknown): CollectionContactAttempt | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const channel = parseContactChannel(
    typeof candidate.channel === "string" ? candidate.channel : null
  );
  const result = parseContactResult(
    typeof candidate.result === "string" ? candidate.result : null
  );
  if (!channel || !result) {
    return null;
  }
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  const followUpRaw =
    typeof candidate.followUpAt === "string" ? candidate.followUpAt.trim() : "";
  const followUpAt =
    followUpRaw && isValidPromiseDate(followUpRaw) ? followUpRaw : null;
  const contactedAtUtc =
    typeof candidate.contactedAtUtc === "string" && candidate.contactedAtUtc.trim()
      ? candidate.contactedAtUtc.trim()
      : new Date(0).toISOString();
  return {
    channel,
    result,
    note,
    followUpAt,
    contactedAtUtc
  };
}

function parseAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? amount : null;
}

export function sanitizeResolution(raw: unknown): CollectionResolution | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const kindRaw = typeof candidate.kind === "string" ? candidate.kind.trim() : "";
  if (!RESOLUTION_KIND_SET.has(kindRaw)) {
    return null;
  }
  const kind = kindRaw as CollectionResolutionKind;
  const resolvedAtUtc =
    typeof candidate.resolvedAtUtc === "string" && candidate.resolvedAtUtc.trim()
      ? candidate.resolvedAtUtc.trim()
      : new Date(0).toISOString();

  const paymentDateRaw =
    typeof candidate.paymentDate === "string" ? candidate.paymentDate.trim() : "";
  const paymentDate =
    paymentDateRaw && isValidPromiseDate(paymentDateRaw) ? paymentDateRaw : null;

  const paidAmount =
    typeof candidate.paidAmount === "number" && Number.isFinite(candidate.paidAmount)
      ? candidate.paidAmount
      : null;
  const remainingAmount =
    typeof candidate.remainingAmount === "number" &&
    Number.isFinite(candidate.remainingAmount)
      ? candidate.remainingAmount
      : null;
  const reason =
    typeof candidate.reason === "string" && candidate.reason.trim()
      ? candidate.reason.trim()
      : null;
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";

  return {
    kind,
    resolvedAtUtc,
    paymentDate,
    paidAmount,
    remainingAmount,
    reason,
    note
  };
}

export function sanitizePromiseRecord(
  raw: unknown,
  expectedInvoiceId?: string
): PromiseToPayRecord | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const invoiceId =
    typeof candidate.invoiceId === "string" ? candidate.invoiceId.trim() : "";
  if (!UUID_RE.test(invoiceId)) {
    return null;
  }
  if (expectedInvoiceId && invoiceId.toLowerCase() !== expectedInvoiceId.trim().toLowerCase()) {
    return null;
  }

  const promiseDate =
    typeof candidate.promiseDate === "string" ? candidate.promiseDate.trim() : "";
  if (!isValidPromiseDate(promiseDate)) {
    return null;
  }

  const statusRaw =
    typeof candidate.status === "string" ? candidate.status.trim() : "";
  if (!STATUS_SET.has(statusRaw)) {
    return null;
  }
  const status = statusRaw as PromiseFollowUpStatus;

  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  const updatedAtUtc =
    typeof candidate.updatedAtUtc === "string" && candidate.updatedAtUtc.trim()
      ? candidate.updatedAtUtc.trim()
      : new Date(0).toISOString();
  const completedAtUtc =
    status === "completed" &&
    typeof candidate.completedAtUtc === "string" &&
    candidate.completedAtUtc.trim()
      ? candidate.completedAtUtc.trim()
      : status === "completed"
        ? updatedAtUtc
        : null;

  const resolution =
    candidate.resolution === undefined || candidate.resolution === null
      ? null
      : sanitizeResolution(candidate.resolution);

  const nextFollowUpRaw =
    typeof candidate.nextFollowUpAt === "string" ? candidate.nextFollowUpAt.trim() : "";
  const nextFollowUpAt =
    nextFollowUpRaw && isValidPromiseDate(nextFollowUpRaw) ? nextFollowUpRaw : null;

  const lastContact =
    candidate.lastContact === undefined || candidate.lastContact === null
      ? null
      : sanitizeContactAttempt(candidate.lastContact);

  const history = sanitizeActivityHistory(candidate.history);

  return {
    invoiceId,
    promiseDate,
    note,
    status,
    updatedAtUtc,
    completedAtUtc,
    resolution,
    nextFollowUpAt,
    lastContact,
    history
  };
}

export function readPromiseFromStorage(
  invoiceId: string,
  storage: Storage | null | undefined = defaultStorage()
): PromiseToPayRecord | null {
  if (!storage || !UUID_RE.test(invoiceId.trim())) {
    return null;
  }

  try {
    const raw = storage.getItem(storageKeyForInvoice(invoiceId));
    if (raw == null || !raw.trim()) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    return sanitizePromiseRecord(parsed, invoiceId);
  } catch {
    return null;
  }
}

export function writePromiseToStorage(
  record: PromiseToPayRecord,
  storage: Storage | null | undefined = defaultStorage()
): boolean {
  if (!storage) {
    return false;
  }
  const clean = sanitizePromiseRecord(record, record.invoiceId);
  if (!clean) {
    return false;
  }
  try {
    storage.setItem(storageKeyForInvoice(clean.invoiceId), JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export function removePromiseFromStorage(
  invoiceId: string,
  storage: Storage | null | undefined = defaultStorage()
): void {
  if (!storage || !UUID_RE.test(invoiceId.trim())) {
    return;
  }
  try {
    storage.removeItem(storageKeyForInvoice(invoiceId));
  } catch {
    // ignore quota / security errors
  }
}

/**
 * Upsert promise for an invoice. Replaces any prior record for the same id (no duplicates).
 * Creating/updating a promise clears a terminal paid resolution so the case reopens cleanly.
 */
export function savePromiseToPay(
  invoiceId: string,
  input: PromiseToPayInput,
  options?: {
    storage?: Storage | null;
    now?: Date;
    preserveStatus?: boolean;
  }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validatePromiseToPayInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  let status: PromiseFollowUpStatus = "awaiting";
  if (
    options?.preserveStatus &&
    existing &&
    existing.status !== "completed" &&
    existing.resolution?.kind !== "paid"
  ) {
    status = existing.status;
  }

  const keepResolution =
    existing?.resolution &&
    existing.resolution.kind !== "paid" &&
    existing.resolution.kind !== "disputed" &&
    existing.resolution.kind !== "escalated"
      ? existing.resolution
      : null;

  const draft: PromiseToPayRecord = {
    invoiceId: invoiceId.trim(),
    promiseDate: validation.promiseDate,
    note: validation.note,
    status,
    updatedAtUtc: now.toISOString(),
    completedAtUtc: null,
    resolution: keepResolution,
    nextFollowUpAt: existing?.nextFollowUpAt ?? null,
    lastContact: existing?.lastContact ?? null,
    history: existing?.history ?? []
  };

  const record: PromiseToPayRecord = {
    ...draft,
    history: historyAfterPromiseSave(existing, draft, now)
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти обіцянку оплати в браузері." };
  }

  return { ok: true, record };
}

export function updatePromiseStatus(
  invoiceId: string,
  nextStatus: PromiseFollowUpStatus,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing) {
    return { ok: false, error: "Обіцянку оплати для цього рахунку не знайдено." };
  }

  const record: PromiseToPayRecord = {
    ...existing,
    status: nextStatus,
    updatedAtUtc: now.toISOString(),
    completedAtUtc: nextStatus === "completed" ? now.toISOString() : null,
    resolution:
      nextStatus === "completed"
        ? existing.resolution?.kind === "paid"
          ? existing.resolution
          : {
              kind: "paid",
              resolvedAtUtc: now.toISOString(),
              paymentDate: localCalendarDateString(now),
              paidAmount: null,
              remainingAmount: 0,
              reason: null,
              note: existing.note
            }
        : nextStatus === "awaiting"
          ? null
          : existing.resolution,
    nextFollowUpAt:
      nextStatus === "completed" || nextStatus === "awaiting"
        ? null
        : nextStatus === "follow_up_required"
          ? existing.nextFollowUpAt
          : existing.nextFollowUpAt,
    history: historyAfterStatusChange(existing, nextStatus, now)
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося оновити follow-up у браузері." };
  }

  return { ok: true, record };
}

export type ResolutionValidationResult =
  | { ok: true; resolution: CollectionResolution; promiseDate: string; note: string; status: PromiseFollowUpStatus }
  | { ok: false; error: string };

export function validateCollectionResolutionInput(
  input: CollectionResolutionInput,
  existing: PromiseToPayRecord,
  now: Date = new Date()
): ResolutionValidationResult {
  const note = (input.note ?? "").trim();
  const resolvedAtUtc = now.toISOString();

  switch (input.kind) {
    case "paid": {
      const paymentDate = (input.paymentDate ?? "").trim();
      if (!paymentDate) {
        return { ok: false, error: "Вкажіть дату оплати." };
      }
      if (!isValidPromiseDate(paymentDate)) {
        return { ok: false, error: "Некоректна дата оплати. Використовуйте формат РРРР-ММ-ДД." };
      }
      return {
        ok: true,
        promiseDate: existing.promiseDate,
        note: note || existing.note,
        status: "completed",
        resolution: {
          kind: "paid",
          resolvedAtUtc,
          paymentDate,
          paidAmount: null,
          remainingAmount: 0,
          reason: null,
          note
        }
      };
    }
    case "partially_paid": {
      const paymentDate = (input.paymentDate ?? "").trim();
      if (!paymentDate) {
        return { ok: false, error: "Вкажіть дату часткової оплати." };
      }
      if (!isValidPromiseDate(paymentDate)) {
        return {
          ok: false,
          error: "Некоректна дата часткової оплати. Використовуйте формат РРРР-ММ-ДД."
        };
      }
      const paidAmount = parseAmount(input.paidAmount);
      const remainingAmount = parseAmount(input.remainingAmount);
      if (paidAmount == null || paidAmount <= 0) {
        return { ok: false, error: "Вкажіть сплачену суму (більше нуля)." };
      }
      if (remainingAmount == null || remainingAmount < 0) {
        return { ok: false, error: "Вкажіть залишок до сплати (нуль або більше)." };
      }
      return {
        ok: true,
        promiseDate: existing.promiseDate,
        note: note || existing.note,
        status: "awaiting",
        resolution: {
          kind: "partially_paid",
          resolvedAtUtc,
          paymentDate,
          paidAmount,
          remainingAmount,
          reason: null,
          note
        }
      };
    }
    case "new_promise": {
      const promiseDate = (input.promiseDate ?? "").trim();
      if (!promiseDate) {
        return { ok: false, error: "Вкажіть нову дату обіцянки оплати." };
      }
      if (!isValidPromiseDate(promiseDate)) {
        return {
          ok: false,
          error: "Некоректна нова дата обіцянки. Використовуйте формат РРРР-ММ-ДД."
        };
      }
      return {
        ok: true,
        promiseDate,
        note: note || existing.note,
        status: "awaiting",
        resolution: {
          kind: "new_promise",
          resolvedAtUtc,
          paymentDate: null,
          paidAmount: null,
          remainingAmount: null,
          reason: null,
          note
        }
      };
    }
    case "disputed": {
      const reason = (input.reason ?? "").trim();
      if (!reason) {
        return { ok: false, error: "Вкажіть причину спору." };
      }
      return {
        ok: true,
        promiseDate: existing.promiseDate,
        note: note || existing.note,
        status: "follow_up_required",
        resolution: {
          kind: "disputed",
          resolvedAtUtc,
          paymentDate: null,
          paidAmount: null,
          remainingAmount: null,
          reason,
          note
        }
      };
    }
    case "escalated": {
      const reason = (input.reason ?? "").trim();
      if (!reason) {
        return { ok: false, error: "Вкажіть причину ескалації." };
      }
      return {
        ok: true,
        promiseDate: existing.promiseDate,
        note: note || existing.note,
        status: "follow_up_required",
        resolution: {
          kind: "escalated",
          resolvedAtUtc,
          paymentDate: null,
          paidAmount: null,
          remainingAmount: null,
          reason,
          note
        }
      };
    }
    case "unable_to_contact": {
      return {
        ok: true,
        promiseDate: existing.promiseDate,
        note: note || existing.note,
        status: "follow_up_required",
        resolution: {
          kind: "unable_to_contact",
          resolvedAtUtc,
          paymentDate: null,
          paidAmount: null,
          remainingAmount: null,
          reason: null,
          note
        }
      };
    }
    default:
      return { ok: false, error: "Невідомий тип resolution." };
  }
}

/**
 * Apply a collection resolution to an existing promise (upsert by invoice id — no duplicates).
 */
export function applyCollectionResolution(
  invoiceId: string,
  input: CollectionResolutionInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing) {
    return { ok: false, error: "Спочатку зафіксуйте обіцянку оплати." };
  }

  const validated = validateCollectionResolutionInput(input, existing, now);
  if (!validated.ok) {
    return validated;
  }

  const record: PromiseToPayRecord = {
    invoiceId: existing.invoiceId,
    promiseDate: validated.promiseDate,
    note: validated.note,
    status: validated.status,
    updatedAtUtc: now.toISOString(),
    completedAtUtc: validated.status === "completed" ? now.toISOString() : null,
    resolution: validated.resolution,
    nextFollowUpAt:
      validated.status === "completed" || validated.resolution.kind === "paid"
        ? null
        : existing.nextFollowUpAt,
    lastContact: existing.lastContact,
    history: historyAfterResolution(
      existing,
      validated.resolution,
      validated.promiseDate,
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти resolution у браузері." };
  }

  return { ok: true, record };
}

function statusAfterContact(
  result: ContactResult,
  followUpAt: string | null
): PromiseFollowUpStatus {
  if (followUpAt) {
    return "follow_up_required";
  }
  if (result === "no_answer" || result === "left_message") {
    return "follow_up_required";
  }
  return "contacted";
}

/**
 * Log a collection contact attempt on the existing durable promise/case record.
 * Creates a minimal case record when none exists yet (same localStorage key).
 * Does not mark the invoice paid/resolved by itself.
 */
export function saveCollectionContact(
  invoiceId: string,
  input: CollectionContactInput,
  options?: { storage?: Storage | null; now?: Date }
): {
  ok: true;
  record: PromiseToPayRecord;
  needsPromise: boolean;
} | { ok: false; error: string } {
  const validation = validateCollectionContactInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  const followUpAt = validation.followUpAt;
  const status = statusAfterContact(validation.result, followUpAt);
  const promiseDate =
    existing?.promiseDate ?? followUpAt ?? localCalendarDateString(now);

  const lastContact: CollectionContactAttempt = {
    channel: validation.channel,
    result: validation.result,
    note: validation.note,
    followUpAt,
    contactedAtUtc: now.toISOString()
  };

  const keepResolution =
    existing?.resolution &&
    existing.resolution.kind !== "paid" &&
    status !== "completed"
      ? existing.resolution
      : existing?.resolution?.kind === "paid"
        ? null
        : existing?.resolution ?? null;

  const draftBase: PromiseToPayRecord = {
    invoiceId: invoiceId.trim(),
    promiseDate,
    note: existing?.note ?? validation.note,
    status,
    updatedAtUtc: now.toISOString(),
    completedAtUtc: null,
    resolution: keepResolution,
    nextFollowUpAt: followUpAt,
    lastContact,
    history: existing?.history ?? []
  };

  const record: PromiseToPayRecord = {
    ...draftBase,
    history: historyAfterContact(
      existing,
      {
        channel: validation.channel,
        result: validation.result,
        note: validation.note,
        followUpAt
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти контакт у браузері." };
  }

  return { ok: true, record, needsPromise: validation.needsPromise };
}

/**
 * Update or clear the next contact follow-up date on an existing case.
 */
export function updateContactFollowUp(
  invoiceId: string,
  followUpAt: string | null | undefined,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing) {
    return { ok: false, error: "Спочатку зафіксуйте контакт або обіцянку оплати." };
  }
  if (existing.status === "completed" || existing.resolution?.kind === "paid") {
    return { ok: false, error: "Завершений кейс не потребує follow-up." };
  }

  const raw = (followUpAt ?? "").trim();
  if (raw && !isValidPromiseDate(raw)) {
    return {
      ok: false,
      error: "Некоректна дата follow-up. Використовуйте формат РРРР-ММ-ДД."
    };
  }
  const nextFollowUpAt = raw || null;
  const status: PromiseFollowUpStatus = nextFollowUpAt
    ? "follow_up_required"
    : existing.status === "follow_up_required"
      ? "contacted"
      : existing.status;

  const record: PromiseToPayRecord = {
    ...existing,
    status,
    nextFollowUpAt,
    lastContact: existing.lastContact
      ? { ...existing.lastContact, followUpAt: nextFollowUpAt }
      : existing.lastContact,
    updatedAtUtc: now.toISOString()
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося оновити follow-up у браузері." };
  }

  return { ok: true, record };
}

export function listPromiseRecordsFromStorage(
  storage: Storage | null | undefined = defaultStorage()
): PromiseToPayRecord[] {
  if (!storage) {
    return [];
  }

  const records: PromiseToPayRecord[] = [];
  try {
    const length = storage.length;
    for (let index = 0; index < length; index += 1) {
      let key: string | null = null;
      try {
        key = storage.key(index);
      } catch {
        continue;
      }
      if (!key || !key.startsWith(PROMISE_STORAGE_KEY_PREFIX)) {
        continue;
      }
      const invoiceId = key.slice(PROMISE_STORAGE_KEY_PREFIX.length);
      const record = readPromiseFromStorage(invoiceId, storage);
      if (record) {
        records.push(record);
      }
    }
  } catch {
    return records;
  }

  return records;
}

export function buildPromiseFollowUpItem(
  invoice: PromiseInvoiceLike,
  record: PromiseToPayRecord,
  now: Date = new Date()
): PromiseFollowUpItem | null {
  const group = classifyPromiseGroup(record, now);
  if (!group) {
    return null;
  }
  const relative = daysRelativeToPromiseDate(record.promiseDate, now) ?? 0;
  const overdueAmount =
    record.resolution?.kind === "partially_paid" &&
    record.resolution.remainingAmount != null
      ? record.resolution.remainingAmount
      : invoice.totalAmount;
  const nextActionDate = record.nextFollowUpAt ?? record.promiseDate;
  return {
    invoiceId: invoice.id,
    documentNumber: invoice.documentNumber,
    counterpartyReference: invoice.counterpartyReference,
    overdueAmount,
    currency: invoice.currency,
    originalDueDate: dueDateCalendarString(invoice.dueDateUtc),
    promiseDate: record.promiseDate,
    nextActionDate,
    daysRelativeToPromise: relative,
    daysRelativeLabel: daysRelativeLabel(relative),
    group,
    groupLabel: promiseGroupLabel(group),
    status: record.status,
    statusLabel: promiseStatusLabel(record.status),
    note: record.note,
    completedAtUtc: record.completedAtUtc,
    resolution: record.resolution,
    resolutionLabel: record.resolution ? resolutionKindLabel(record.resolution.kind) : null,
    nextFollowUpAt: record.nextFollowUpAt,
    lastContact: record.lastContact
  };
}

export function buildPromiseFollowUpItems(
  invoices: readonly PromiseInvoiceLike[],
  records: readonly PromiseToPayRecord[],
  now: Date = new Date()
): PromiseFollowUpItem[] {
  const byId = new Map(invoices.map((invoice) => [invoice.id.toLowerCase(), invoice]));
  const items: PromiseFollowUpItem[] = [];

  for (const record of records) {
    const invoice = byId.get(record.invoiceId.toLowerCase());
    if (!invoice) {
      continue;
    }
    const item = buildPromiseFollowUpItem(invoice, record, now);
    if (item) {
      items.push(item);
    }
  }

  return items.sort(comparePromiseFollowUpPriority);
}

export function comparePromiseFollowUpPriority(
  a: PromiseFollowUpItem,
  b: PromiseFollowUpItem
): number {
  const groupRank: Record<PromiseGroupId, number> = {
    broken: 0,
    due_today: 1,
    follow_up_required: 2,
    disputed: 3,
    escalated: 4,
    upcoming: 5,
    completed: 6
  };
  if (groupRank[a.group] !== groupRank[b.group]) {
    return groupRank[a.group] - groupRank[b.group];
  }
  if (a.promiseDate !== b.promiseDate) {
    return a.promiseDate < b.promiseDate ? -1 : 1;
  }
  if (a.overdueAmount !== b.overdueAmount) {
    return b.overdueAmount - a.overdueAmount;
  }
  return a.invoiceId < b.invoiceId ? -1 : a.invoiceId > b.invoiceId ? 1 : 0;
}

export function filterPromiseFollowUps(
  items: readonly PromiseFollowUpItem[],
  options: {
    group?: PromiseGroupFilter;
    search?: string;
  } = {}
): PromiseFollowUpItem[] {
  const group = options.group ?? "";
  const search = (options.search ?? "").trim().toLowerCase();

  return items.filter((item) => {
    if (group && item.group !== group) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack = `${item.documentNumber} ${item.counterpartyReference}`.toLowerCase();
    return haystack.includes(search);
  });
}

function isResolvedToday(item: PromiseFollowUpItem, now: Date): boolean {
  const resolvedAt =
    item.resolution?.resolvedAtUtc ??
    (item.group === "completed" ? item.completedAtUtc : null);
  if (!resolvedAt) {
    return false;
  }
  const day = dueDateCalendarString(resolvedAt);
  return day === localCalendarDateString(now);
}

export function buildPromiseFollowUpSummary(
  items: readonly PromiseFollowUpItem[],
  now: Date = new Date()
): PromiseFollowUpSummary {
  const dueTodayCount = items.filter((item) => item.group === "due_today").length;
  const brokenCount = items.filter((item) => item.group === "broken").length;
  const followUpRequiredCount = items.filter(
    (item) => item.group === "follow_up_required"
  ).length;
  const completedCount = items.filter((item) => item.group === "completed").length;
  const escalatedCount = items.filter((item) => item.group === "escalated").length;
  const disputedCount = items.filter((item) => item.group === "disputed").length;
  const resolvedTodayCount = items.filter((item) => isResolvedToday(item, now)).length;

  const active = items.filter(
    (item) =>
      item.group !== "completed" &&
      item.group !== "disputed" &&
      item.group !== "escalated"
  );
  const totals = new Map<string, number>();
  for (const item of active) {
    const code = item.currency?.trim() || "—";
    totals.set(code, (totals.get(code) ?? 0) + item.overdueAmount);
  }

  const promisedTotalsByCurrency = [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    dueTodayCount,
    brokenCount,
    followUpRequiredCount,
    completedCount,
    resolvedTodayCount,
    escalatedCount,
    disputedCount,
    promisedTotalsByCurrency
  };
}

export function groupPromiseFollowUps(
  items: readonly PromiseFollowUpItem[]
): Record<PromiseGroupId, PromiseFollowUpItem[]> {
  const groups: Record<PromiseGroupId, PromiseFollowUpItem[]> = {
    due_today: [],
    upcoming: [],
    broken: [],
    follow_up_required: [],
    completed: [],
    disputed: [],
    escalated: []
  };
  for (const item of items) {
    groups[item.group].push(item);
  }
  return groups;
}

function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage;
  } catch {
    return null;
  }
}
