/**
 * Promise-to-pay follow-up workflow (browser-local persistence).
 * Keys are stable invoice ids — never row index or display number alone.
 * No server collection/follow-up contract exists yet.
 */

import {
  calendarDayDiff,
  dueDateCalendarString,
  localCalendarDateString
} from "./invoiceDueDateAging.ts";

export const PROMISE_STORAGE_KEY_PREFIX = "vectorflow.finance.promiseToPay.";

export type PromiseFollowUpStatus =
  | "awaiting"
  | "follow_up_required"
  | "contacted"
  | "completed";

/** Classification groups for the Promise Follow-ups workspace. */
export type PromiseGroupId =
  | "due_today"
  | "upcoming"
  | "broken"
  | "follow_up_required"
  | "completed";

export type PromiseGroupFilter = "" | PromiseGroupId;

export type PromiseToPayRecord = {
  invoiceId: string;
  promiseDate: string;
  note: string;
  status: PromiseFollowUpStatus;
  updatedAtUtc: string;
  completedAtUtc: string | null;
};

export type PromiseToPayInput = {
  promiseDate: string;
  note?: string;
};

export type PromiseValidationResult =
  | { ok: true; promiseDate: string; note: string }
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
  /** Days until promise (positive) or days past promise (negative). 0 = due today. */
  daysRelativeToPromise: number;
  daysRelativeLabel: string;
  group: PromiseGroupId;
  groupLabel: string;
  status: PromiseFollowUpStatus;
  statusLabel: string;
  note: string;
  completedAtUtc: string | null;
};

export type PromiseFollowUpSummary = {
  dueTodayCount: number;
  brokenCount: number;
  followUpRequiredCount: number;
  /** Amounts by currency for active (non-completed) promises. */
  promisedTotalsByCurrency: { currency: string; amount: number }[];
};

export type PromiseGroupOption = {
  id: PromiseGroupFilter;
  label: string;
  shortLabel: string;
};

export const PROMISE_GROUP_OPTIONS: readonly PromiseGroupOption[] = [
  { id: "", label: "Усі follow-ups", shortLabel: "Усі" },
  { id: "due_today", label: "Due today", shortLabel: "Due today" },
  { id: "upcoming", label: "Upcoming", shortLabel: "Upcoming" },
  { id: "broken", label: "Broken promises", shortLabel: "Broken" },
  { id: "follow_up_required", label: "Follow-up required", shortLabel: "Follow-up" },
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

const COMPLETED_RECENT_DAYS = 14;

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

export function parsePromiseGroupParam(value: string | null | undefined): PromiseGroupFilter {
  if (value == null) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const ids: PromiseGroupId[] = [
    "due_today",
    "upcoming",
    "broken",
    "follow_up_required",
    "completed"
  ];
  return (ids as readonly string[]).includes(trimmed) ? (trimmed as PromiseGroupId) : "";
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

/**
 * Classify an active or completed promise into a follow-up workspace group.
 * Completed recently wins over date-based buckets.
 * Explicit follow_up_required status wins over date buckets (except completed).
 */
export function classifyPromiseGroup(
  record: Pick<PromiseToPayRecord, "promiseDate" | "status" | "completedAtUtc">,
  now: Date = new Date()
): PromiseGroupId | null {
  if (record.status === "completed") {
    if (!record.completedAtUtc) {
      return "completed";
    }
    const completedDay = dueDateCalendarString(record.completedAtUtc);
    if (!completedDay) {
      return "completed";
    }
    const age = calendarDayDiff(completedDay, localCalendarDateString(now));
    return age >= 0 && age <= COMPLETED_RECENT_DAYS ? "completed" : null;
  }

  if (record.status === "follow_up_required") {
    return "follow_up_required";
  }

  const relative = daysRelativeToPromiseDate(record.promiseDate, now);
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

  return {
    invoiceId,
    promiseDate,
    note,
    status,
    updatedAtUtc,
    completedAtUtc
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
  if (options?.preserveStatus && existing && existing.status !== "completed") {
    status = existing.status;
  }

  const record: PromiseToPayRecord = {
    invoiceId: invoiceId.trim(),
    promiseDate: validation.promiseDate,
    note: validation.note,
    status,
    updatedAtUtc: now.toISOString(),
    completedAtUtc: null
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
    completedAtUtc: nextStatus === "completed" ? now.toISOString() : null
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
  return {
    invoiceId: invoice.id,
    documentNumber: invoice.documentNumber,
    counterpartyReference: invoice.counterpartyReference,
    overdueAmount: invoice.totalAmount,
    currency: invoice.currency,
    originalDueDate: dueDateCalendarString(invoice.dueDateUtc),
    promiseDate: record.promiseDate,
    daysRelativeToPromise: relative,
    daysRelativeLabel: daysRelativeLabel(relative),
    group,
    groupLabel: promiseGroupLabel(group),
    status: record.status,
    statusLabel: promiseStatusLabel(record.status),
    note: record.note,
    completedAtUtc: record.completedAtUtc
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
    upcoming: 3,
    completed: 4
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

export function buildPromiseFollowUpSummary(
  items: readonly PromiseFollowUpItem[]
): PromiseFollowUpSummary {
  const dueTodayCount = items.filter((item) => item.group === "due_today").length;
  const brokenCount = items.filter((item) => item.group === "broken").length;
  const followUpRequiredCount = items.filter(
    (item) => item.group === "follow_up_required"
  ).length;

  const active = items.filter((item) => item.group !== "completed");
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
    completed: []
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
