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
  historyAfterDisputeChange,
  historyAfterEscalationChange,
  historyAfterNoteChange,
  historyAfterPaymentPlanChange,
  historyAfterPromiseSave,
  historyAfterResolution,
  historyAfterStatusChange,
  parseContactChannel,
  parseContactResult,
  parseDisputeParty,
  parseDisputeReason,
  parseEscalationPriority,
  parseEscalationReason,
  parseEscalationTeam,
  sanitizeActivityHistory,
  type CollectionActivityEvent,
  type ContactChannel,
  type ContactResult,
  type DisputeParty,
  type DisputeReason,
  type EscalationPriority,
  type EscalationReason,
  type EscalationTeam
} from "./collectionCaseHistory.ts";
import {
  applyPlanCompletionIfNeeded,
  buildInstallmentsFromValidated,
  createPaymentPlanEntity,
  hasOverdueInstallment,
  isActivePaymentPlan,
  planPaidTotal,
  selectNextInstallment,
  summarizePlanUpdate,
  sanitizePaymentPlan,
  validateInstallmentPaymentInput,
  validatePaymentPlanCancelInput,
  validatePaymentPlanCreateInput,
  validatePaymentPlanUpdateInput,
  type CollectionPaymentPlan,
  type InstallmentPaymentInput,
  type PaymentPlanCancelInput,
  type PaymentPlanCreateInput,
  type PaymentPlanUpdateInput
} from "./paymentPlan.ts";
import {
  createCollectionNoteEntity,
  hasOpenHandoffNotes,
  isActiveCollectionNote,
  listActiveCollectionNotes,
  listPinnedCollectionNotes,
  sanitizeCollectionNotes,
  summarizeNoteForHistory,
  validateCollectionNoteInput,
  type CollectionNote,
  type CollectionNoteInput,
  type CollectionNoteUpdateInput
} from "./collectionNotes.ts";

export type {
  CollectionPaymentInstallment,
  CollectionPaymentPlan,
  InstallmentComputedStatus,
  InstallmentPaymentInput,
  PaymentPlanCancelInput,
  PaymentPlanCreateInput,
  PaymentPlanStatus,
  PaymentPlanUpdateInput
} from "./paymentPlan.ts";

export type {
  CollectionNote,
  CollectionNoteCategory,
  CollectionNoteInput,
  CollectionNoteUpdateInput,
  CollectionNoteVisibility
} from "./collectionNotes.ts";

export {
  computeInstallmentStatus,
  countPaidInstallments,
  emptyInstallmentDraft,
  hasOverdueInstallment,
  installmentStatusLabel,
  isActivePaymentPlan,
  listOverdueInstallments,
  parseMoneyAmount,
  paymentPlanStatusLabel,
  planInstallmentRemaining,
  planPaidTotal,
  planProgressRatio,
  planRemainingTotal,
  roundMoney,
  selectNextInstallment,
  validateInstallmentPaymentInput,
  validatePaymentPlanCancelInput,
  validatePaymentPlanCreateInput,
  validatePaymentPlanUpdateInput
} from "./paymentPlan.ts";

export {
  NOTE_CATEGORY_OPTIONS,
  countActiveCollectionNotes,
  hasOpenHandoffNotes,
  isActiveCollectionNote,
  listActiveCollectionNotes,
  listPinnedCollectionNotes,
  noteCategoryLabel,
  parseNoteCategory,
  sortCollectionNotesForDisplay,
  validateCollectionNoteInput
} from "./collectionNotes.ts";

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
  | "escalated"
  | "payment_plans";

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

export type DisputeStatus = "open" | "resolved" | "rejected";

export type CollectionDispute = {
  id: string;
  status: DisputeStatus;
  reason: DisputeReason;
  description: string;
  responsibleParty: DisputeParty;
  openedAtUtc: string;
  updatedAtUtc: string;
  nextReviewAt: string | null;
  resolutionComment: string | null;
  resolvedAtUtc: string | null;
};

export type EscalationStatus = "open" | "completed";

export type CollectionEscalation = {
  id: string;
  status: EscalationStatus;
  reason: EscalationReason;
  priority: EscalationPriority;
  responsibleTeam: EscalationTeam;
  requestedAction: string;
  dueDate: string;
  openedAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc: string | null;
  completionComment: string | null;
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
  /** Structured collection dispute lifecycle (separate from resolution.kind). */
  dispute: CollectionDispute | null;
  /** Structured collection escalation / ownership lifecycle. */
  escalation: CollectionEscalation | null;
  /** Agreed multi-installment repayment schedule (operational tracking). */
  paymentPlan: CollectionPaymentPlan | null;
  /** Internal collaboration notes thread (append / edit / archive). */
  notes: CollectionNote[];
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

export type CollectionDisputeInput = {
  reason: DisputeReason | "";
  description?: string;
  responsibleParty: DisputeParty | "";
  nextReviewAt?: string;
};

export type DisputeValidationResult =
  | {
      ok: true;
      reason: DisputeReason;
      description: string;
      responsibleParty: DisputeParty;
      nextReviewAt: string | null;
    }
  | { ok: false; error: string };

export type DisputeCloseInput = {
  comment?: string;
};

export type CollectionEscalationInput = {
  reason: EscalationReason | "";
  priority: EscalationPriority | "";
  responsibleTeam: EscalationTeam | "";
  requestedAction?: string;
  dueDate?: string;
  note?: string;
};

export type EscalationValidationResult =
  | {
      ok: true;
      reason: EscalationReason;
      priority: EscalationPriority;
      responsibleTeam: EscalationTeam;
      requestedAction: string;
      dueDate: string;
      note: string;
    }
  | { ok: false; error: string };

export type EscalationCompleteInput = {
  comment?: string;
};

/** Deterministic next-action kinds among active business dates. */
export type NextActionKind =
  | "critical_escalation"
  | "payment_plan_installment"
  | "dispute_review"
  | "escalation"
  | "contact_follow_up";

export type NextActionCandidate = {
  kind: NextActionKind;
  date: string;
  label: string;
};

export type NextActionSelection = NextActionCandidate;

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
  dispute: CollectionDispute | null;
  disputeReviewAt: string | null;
  escalation: CollectionEscalation | null;
  escalationDueAt: string | null;
  escalationOverdue: boolean;
  paymentPlan: CollectionPaymentPlan | null;
  paymentPlanAmount: number | null;
  paymentPlanPaidTotal: number | null;
  paymentPlanRemainingTotal: number | null;
  paymentPlanNextDueAt: string | null;
  paymentPlanOverdue: boolean;
  paymentPlanProgress: number | null;
  notes: CollectionNote[];
  activeNotesCount: number;
  pinnedNotesCount: number;
  hasOpenHandoffNotes: boolean;
  nextActionKind: NextActionKind | null;
  nextActionLabel: string | null;
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
  { id: "payment_plans", label: "Payment plans", shortLabel: "Plans" },
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
  "escalated",
  "payment_plans"
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

export function validateCollectionDisputeInput(
  input: CollectionDisputeInput
): DisputeValidationResult {
  const reason = parseDisputeReason(input.reason);
  const responsibleParty = parseDisputeParty(input.responsibleParty);
  const description = (input.description ?? "").trim();
  const reviewRaw = (input.nextReviewAt ?? "").trim();

  if (!reason && !responsibleParty && !description && !reviewRaw) {
    return { ok: false, error: "Заповніть обовʼязкові поля спору." };
  }
  if (!reason) {
    return { ok: false, error: "Оберіть причину спору." };
  }
  if (!description) {
    return { ok: false, error: "Вкажіть опис спору." };
  }
  if (!responsibleParty) {
    return { ok: false, error: "Оберіть відповідальну сторону." };
  }
  if (reviewRaw && !isValidPromiseDate(reviewRaw)) {
    return {
      ok: false,
      error: "Некоректна дата review. Використовуйте формат РРРР-ММ-ДД."
    };
  }

  return {
    ok: true,
    reason,
    description,
    responsibleParty,
    nextReviewAt: reviewRaw || null
  };
}

export function validateDisputeCloseInput(
  input: DisputeCloseInput
): { ok: true; comment: string } | { ok: false; error: string } {
  const comment = (input.comment ?? "").trim();
  if (!comment) {
    return { ok: false, error: "Вкажіть підсумковий коментар." };
  }
  return { ok: true, comment };
}

export function disputeStatusLabel(status: DisputeStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "resolved":
      return "Resolved";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

export function isActiveDispute(
  dispute: CollectionDispute | null | undefined
): boolean {
  return dispute?.status === "open";
}

export function validateCollectionEscalationInput(
  input: CollectionEscalationInput
): EscalationValidationResult {
  const reason = parseEscalationReason(input.reason);
  const priority = parseEscalationPriority(input.priority);
  const responsibleTeam = parseEscalationTeam(input.responsibleTeam);
  const requestedAction = (input.requestedAction ?? "").trim();
  const dueRaw = (input.dueDate ?? "").trim();
  const note = (input.note ?? "").trim();

  if (!reason && !priority && !responsibleTeam && !requestedAction && !dueRaw && !note) {
    return { ok: false, error: "Заповніть обовʼязкові поля ескалації." };
  }
  if (!reason) {
    return { ok: false, error: "Оберіть причину ескалації." };
  }
  if (!priority) {
    return { ok: false, error: "Оберіть пріоритет ескалації." };
  }
  if (!responsibleTeam) {
    return { ok: false, error: "Оберіть відповідальний підрозділ." };
  }
  if (!requestedAction) {
    return { ok: false, error: "Вкажіть очікувану наступну дію." };
  }
  if (!dueRaw) {
    return { ok: false, error: "Вкажіть строк обробки ескалації." };
  }
  if (!isValidPromiseDate(dueRaw)) {
    return {
      ok: false,
      error: "Некоректна дата due. Використовуйте формат РРРР-ММ-ДД."
    };
  }

  return {
    ok: true,
    reason,
    priority,
    responsibleTeam,
    requestedAction,
    dueDate: dueRaw,
    note
  };
}

export function validateEscalationCompleteInput(
  input: EscalationCompleteInput
): { ok: true; comment: string } | { ok: false; error: string } {
  const comment = (input.comment ?? "").trim();
  if (!comment) {
    return { ok: false, error: "Вкажіть підсумковий коментар." };
  }
  return { ok: true, comment };
}

export function escalationStatusLabel(status: EscalationStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

export function isActiveEscalation(
  escalation: CollectionEscalation | null | undefined
): boolean {
  return escalation?.status === "open";
}

export function isEscalationOverdue(
  escalation: CollectionEscalation | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isActiveEscalation(escalation) || !escalation?.dueDate) {
    return false;
  }
  const today = localCalendarDateString(now);
  const relative = calendarDayDiff(today, escalation.dueDate);
  return relative != null && relative < 0;
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
 * Resolution outcomes, open escalations, and open disputes take precedence over
 * calendar buckets. Active payment plans form their own queue after dispute.
 * Contact nextFollowUpAt places the case in follow_up_required
 * when active (unless an open escalation/dispute/payment plan or terminal resolution wins).
 */
export function classifyPromiseGroup(
  record: Pick<
    PromiseToPayRecord,
    | "promiseDate"
    | "status"
    | "completedAtUtc"
    | "resolution"
    | "nextFollowUpAt"
    | "dispute"
    | "escalation"
    | "paymentPlan"
  >,
  now: Date = new Date()
): PromiseGroupId | null {
  const resolution = record.resolution;

  if (resolution?.kind === "paid") {
    return isRecentCompleted(resolution.resolvedAtUtc ?? record.completedAtUtc, now)
      ? "completed"
      : null;
  }

  if (isActiveEscalation(record.escalation) || resolution?.kind === "escalated") {
    return "escalated";
  }

  if (isActiveDispute(record.dispute) || resolution?.kind === "disputed") {
    return "disputed";
  }

  if (isActivePaymentPlan(record.paymentPlan)) {
    return "payment_plans";
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

const DISPUTE_STATUS_SET: ReadonlySet<string> = new Set([
  "open",
  "resolved",
  "rejected"
]);

const ESCALATION_STATUS_SET: ReadonlySet<string> = new Set(["open", "completed"]);

export function sanitizeDispute(raw: unknown): CollectionDispute | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const statusRaw = typeof candidate.status === "string" ? candidate.status.trim() : "";
  if (!DISPUTE_STATUS_SET.has(statusRaw)) {
    return null;
  }
  const reason = parseDisputeReason(
    typeof candidate.reason === "string" ? candidate.reason : null
  );
  const responsibleParty = parseDisputeParty(
    typeof candidate.responsibleParty === "string" ? candidate.responsibleParty : null
  );
  if (!reason || !responsibleParty) {
    return null;
  }
  const description =
    typeof candidate.description === "string" ? candidate.description.trim() : "";
  if (!description) {
    return null;
  }
  const openedAtUtc =
    typeof candidate.openedAtUtc === "string" && candidate.openedAtUtc.trim()
      ? candidate.openedAtUtc.trim()
      : new Date(0).toISOString();
  const updatedAtUtc =
    typeof candidate.updatedAtUtc === "string" && candidate.updatedAtUtc.trim()
      ? candidate.updatedAtUtc.trim()
      : openedAtUtc;
  const reviewRaw =
    typeof candidate.nextReviewAt === "string" ? candidate.nextReviewAt.trim() : "";
  const nextReviewAt =
    reviewRaw && isValidPromiseDate(reviewRaw) ? reviewRaw : null;
  const resolutionComment =
    typeof candidate.resolutionComment === "string" && candidate.resolutionComment.trim()
      ? candidate.resolutionComment.trim()
      : null;
  const resolvedAtUtc =
    typeof candidate.resolvedAtUtc === "string" && candidate.resolvedAtUtc.trim()
      ? candidate.resolvedAtUtc.trim()
      : null;
  return {
    id,
    status: statusRaw as DisputeStatus,
    reason,
    description,
    responsibleParty,
    openedAtUtc,
    updatedAtUtc,
    nextReviewAt,
    resolutionComment,
    resolvedAtUtc
  };
}

export function sanitizeEscalation(raw: unknown): CollectionEscalation | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const statusRaw = typeof candidate.status === "string" ? candidate.status.trim() : "";
  if (!ESCALATION_STATUS_SET.has(statusRaw)) {
    return null;
  }
  const reason = parseEscalationReason(
    typeof candidate.reason === "string" ? candidate.reason : null
  );
  const priority = parseEscalationPriority(
    typeof candidate.priority === "string" ? candidate.priority : null
  );
  const responsibleTeam = parseEscalationTeam(
    typeof candidate.responsibleTeam === "string" ? candidate.responsibleTeam : null
  );
  if (!reason || !priority || !responsibleTeam) {
    return null;
  }
  const requestedAction =
    typeof candidate.requestedAction === "string" ? candidate.requestedAction.trim() : "";
  if (!requestedAction) {
    return null;
  }
  const dueRaw = typeof candidate.dueDate === "string" ? candidate.dueDate.trim() : "";
  if (!dueRaw || !isValidPromiseDate(dueRaw)) {
    return null;
  }
  const openedAtUtc =
    typeof candidate.openedAtUtc === "string" && candidate.openedAtUtc.trim()
      ? candidate.openedAtUtc.trim()
      : new Date(0).toISOString();
  const updatedAtUtc =
    typeof candidate.updatedAtUtc === "string" && candidate.updatedAtUtc.trim()
      ? candidate.updatedAtUtc.trim()
      : openedAtUtc;
  const completedAtUtc =
    typeof candidate.completedAtUtc === "string" && candidate.completedAtUtc.trim()
      ? candidate.completedAtUtc.trim()
      : null;
  const completionComment =
    typeof candidate.completionComment === "string" && candidate.completionComment.trim()
      ? candidate.completionComment.trim()
      : null;
  return {
    id,
    status: statusRaw as EscalationStatus,
    reason,
    priority,
    responsibleTeam,
    requestedAction,
    dueDate: dueRaw,
    openedAtUtc,
    updatedAtUtc,
    completedAtUtc,
    completionComment
  };
}

/** Tie-break order when multiple active actions share the same calendar date. */
export const NEXT_ACTION_TIE_BREAK: readonly NextActionKind[] = [
  "critical_escalation",
  "payment_plan_installment",
  "dispute_review",
  "escalation",
  "contact_follow_up"
] as const;

const NEXT_ACTION_RANK: Record<NextActionKind, number> = {
  critical_escalation: 0,
  payment_plan_installment: 1,
  dispute_review: 2,
  escalation: 3,
  contact_follow_up: 4
};

const NEXT_ACTION_LABELS: Record<NextActionKind, string> = {
  critical_escalation: "Critical escalation due",
  payment_plan_installment: "Payment plan installment due",
  dispute_review: "Dispute review",
  escalation: "Escalation due",
  contact_follow_up: "Contact follow-up"
};

export function listActiveNextActionCandidates(
  record: Pick<
    PromiseToPayRecord,
    "nextFollowUpAt" | "dispute" | "escalation" | "paymentPlan"
  >
): NextActionCandidate[] {
  const candidates: NextActionCandidate[] = [];
  if (record.nextFollowUpAt) {
    candidates.push({
      kind: "contact_follow_up",
      date: record.nextFollowUpAt,
      label: NEXT_ACTION_LABELS.contact_follow_up
    });
  }
  if (isActiveDispute(record.dispute) && record.dispute?.nextReviewAt) {
    candidates.push({
      kind: "dispute_review",
      date: record.dispute.nextReviewAt,
      label: NEXT_ACTION_LABELS.dispute_review
    });
  }
  if (isActiveEscalation(record.escalation) && record.escalation?.dueDate) {
    const critical = record.escalation.priority === "critical";
    candidates.push({
      kind: critical ? "critical_escalation" : "escalation",
      date: record.escalation.dueDate,
      label: critical
        ? NEXT_ACTION_LABELS.critical_escalation
        : NEXT_ACTION_LABELS.escalation
    });
  }
  if (isActivePaymentPlan(record.paymentPlan) && record.paymentPlan) {
    const nextInstallment = selectNextInstallment(record.paymentPlan);
    if (nextInstallment) {
      candidates.push({
        kind: "payment_plan_installment",
        date: nextInstallment.dueDate,
        label: NEXT_ACTION_LABELS.payment_plan_installment
      });
    }
  }
  return candidates;
}

/**
 * Choose the earliest active business date; on ties use NEXT_ACTION_TIE_BREAK.
 */
export function resolveNextAction(
  record: Pick<
    PromiseToPayRecord,
    "nextFollowUpAt" | "dispute" | "escalation" | "paymentPlan" | "promiseDate"
  >
): NextActionSelection | null {
  const candidates = listActiveNextActionCandidates(record);
  if (candidates.length === 0) {
    return null;
  }
  return candidates.slice().sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? -1 : 1;
    }
    return NEXT_ACTION_RANK[a.kind] - NEXT_ACTION_RANK[b.kind];
  })[0]!;
}

/** Earliest actionable calendar date among contact, dispute review, and escalation. */
export function resolveNextActionDate(record: PromiseToPayRecord): string {
  const selected = resolveNextAction(record);
  return selected?.date ?? record.promiseDate;
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

  const dispute =
    candidate.dispute === undefined || candidate.dispute === null
      ? null
      : sanitizeDispute(candidate.dispute);

  const escalation =
    candidate.escalation === undefined || candidate.escalation === null
      ? null
      : sanitizeEscalation(candidate.escalation);

  const paymentPlan =
    candidate.paymentPlan === undefined || candidate.paymentPlan === null
      ? null
      : sanitizePaymentPlan(candidate.paymentPlan);

  const notes = sanitizeCollectionNotes(candidate.notes);
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
    dispute,
    escalation,
    paymentPlan,
    notes,
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
  if (isActivePaymentPlan(existing?.paymentPlan)) {
    return {
      ok: false,
      error:
        "Активний payment plan уже існує. Завершіть або скасуйте план перед новою Promise to Pay."
    };
  }
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
    dispute: existing?.dispute ?? null,
    escalation: existing?.escalation ?? null,
    paymentPlan: existing?.paymentPlan ?? null,
    notes: existing?.notes ?? [],
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
    dispute: existing.dispute,
    escalation: existing.escalation,
    paymentPlan: existing.paymentPlan,
    notes: existing.notes,
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
    dispute: existing?.dispute ?? null,
    escalation: existing?.escalation ?? null,
    paymentPlan: existing?.paymentPlan ?? null,
    notes: existing?.notes ?? [],
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

function createDisputeId(invoiceId: string, now: Date): string {
  return `dispute|${invoiceId.trim().toLowerCase()}|${now.toISOString()}`;
}

/**
 * Raise a structured collection dispute on the durable case record.
 * Does not mark the invoice paid and does not apply Collection Resolution.
 */
export function raiseCollectionDispute(
  invoiceId: string,
  input: CollectionDisputeInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateCollectionDisputeInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (isActiveDispute(existing?.dispute)) {
    return {
      ok: false,
      error: "Активний спір уже існує. Оновіть або завершіть поточний спір."
    };
  }

  const at = now.toISOString();
  const dispute: CollectionDispute = {
    id: createDisputeId(invoiceId, now),
    status: "open",
    reason: validation.reason,
    description: validation.description,
    responsibleParty: validation.responsibleParty,
    openedAtUtc: at,
    updatedAtUtc: at,
    nextReviewAt: validation.nextReviewAt,
    resolutionComment: null,
    resolvedAtUtc: null
  };

  const promiseDate =
    existing?.promiseDate ?? validation.nextReviewAt ?? localCalendarDateString(now);
  const draftBase: PromiseToPayRecord = {
    invoiceId: invoiceId.trim(),
    promiseDate,
    note: existing?.note ?? "",
    status: existing?.status === "completed" ? "awaiting" : existing?.status ?? "awaiting",
    updatedAtUtc: at,
    completedAtUtc: null,
    resolution:
      existing?.resolution?.kind === "paid" ? null : existing?.resolution ?? null,
    nextFollowUpAt: existing?.nextFollowUpAt ?? null,
    lastContact: existing?.lastContact ?? null,
    dispute,
    escalation: existing?.escalation ?? null,
    paymentPlan: existing?.paymentPlan ?? null,
    notes: existing?.notes ?? [],
    history: existing?.history ?? []
  };

  const record: PromiseToPayRecord = {
    ...draftBase,
    history: historyAfterDisputeChange(
      existing,
      "dispute_raised",
      {
        reason: dispute.reason,
        responsibleParty: dispute.responsibleParty,
        description: dispute.description,
        nextReviewAt: dispute.nextReviewAt
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти спір у браузері." };
  }

  return { ok: true, record };
}

export function updateCollectionDispute(
  invoiceId: string,
  input: CollectionDisputeInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateCollectionDisputeInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !isActiveDispute(existing.dispute)) {
    return { ok: false, error: "Активний спір для цього рахунку не знайдено." };
  }

  const previous = existing.dispute!;
  const unchanged =
    previous.reason === validation.reason &&
    previous.description === validation.description &&
    previous.responsibleParty === validation.responsibleParty &&
    previous.nextReviewAt === validation.nextReviewAt;
  if (unchanged) {
    return { ok: true, record: existing };
  }

  const dispute: CollectionDispute = {
    ...previous,
    reason: validation.reason,
    description: validation.description,
    responsibleParty: validation.responsibleParty,
    nextReviewAt: validation.nextReviewAt,
    updatedAtUtc: now.toISOString()
  };

  const record: PromiseToPayRecord = {
    ...existing,
    dispute,
    updatedAtUtc: now.toISOString(),
    history: historyAfterDisputeChange(
      existing,
      "dispute_updated",
      {
        reason: dispute.reason,
        responsibleParty: dispute.responsibleParty,
        description: dispute.description,
        nextReviewAt: dispute.nextReviewAt
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося оновити спір у браузері." };
  }

  return { ok: true, record };
}

export function resolveCollectionDispute(
  invoiceId: string,
  input: DisputeCloseInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  return closeCollectionDispute(invoiceId, "resolved", input, options);
}

export function rejectCollectionDispute(
  invoiceId: string,
  input: DisputeCloseInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  return closeCollectionDispute(invoiceId, "rejected", input, options);
}

function closeCollectionDispute(
  invoiceId: string,
  status: "resolved" | "rejected",
  input: DisputeCloseInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateDisputeCloseInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !isActiveDispute(existing.dispute)) {
    return { ok: false, error: "Активний спір для цього рахунку не знайдено." };
  }

  const at = now.toISOString();
  const dispute: CollectionDispute = {
    ...existing.dispute!,
    status,
    resolutionComment: validation.comment,
    resolvedAtUtc: at,
    updatedAtUtc: at,
    nextReviewAt: null
  };

  const eventType = status === "resolved" ? "dispute_resolved" : "dispute_rejected";
  const record: PromiseToPayRecord = {
    ...existing,
    dispute,
    updatedAtUtc: at,
    history: historyAfterDisputeChange(
      existing,
      eventType,
      {
        reason: dispute.reason,
        responsibleParty: dispute.responsibleParty,
        description: dispute.description,
        nextReviewAt: null,
        resolutionComment: validation.comment
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося завершити спір у браузері." };
  }

  return { ok: true, record };
}

function createEscalationId(invoiceId: string, now: Date): string {
  return `escalation|${invoiceId.trim().toLowerCase()}|${now.toISOString()}`;
}

/**
 * Escalate a collection case with ownership / priority metadata.
 * Does not mark the invoice paid and does not apply Collection Resolution.
 */
export function raiseCollectionEscalation(
  invoiceId: string,
  input: CollectionEscalationInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateCollectionEscalationInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (isActiveEscalation(existing?.escalation)) {
    return {
      ok: false,
      error: "Активна ескалація вже існує. Оновіть або завершіть поточну ескалацію."
    };
  }

  const at = now.toISOString();
  const escalation: CollectionEscalation = {
    id: createEscalationId(invoiceId, now),
    status: "open",
    reason: validation.reason,
    priority: validation.priority,
    responsibleTeam: validation.responsibleTeam,
    requestedAction: validation.requestedAction,
    dueDate: validation.dueDate,
    openedAtUtc: at,
    updatedAtUtc: at,
    completedAtUtc: null,
    completionComment: null
  };

  const promiseDate =
    existing?.promiseDate ?? validation.dueDate ?? localCalendarDateString(now);
  const draftBase: PromiseToPayRecord = {
    invoiceId: invoiceId.trim(),
    promiseDate,
    note: existing?.note ?? validation.note,
    status: existing?.status === "completed" ? "awaiting" : existing?.status ?? "awaiting",
    updatedAtUtc: at,
    completedAtUtc: null,
    resolution:
      existing?.resolution?.kind === "paid" ? null : existing?.resolution ?? null,
    nextFollowUpAt: existing?.nextFollowUpAt ?? null,
    lastContact: existing?.lastContact ?? null,
    dispute: existing?.dispute ?? null,
    escalation,
    paymentPlan: existing?.paymentPlan ?? null,
    notes: existing?.notes ?? [],
    history: existing?.history ?? []
  };

  const record: PromiseToPayRecord = {
    ...draftBase,
    history: historyAfterEscalationChange(
      existing,
      "case_escalated",
      {
        reason: escalation.reason,
        priority: escalation.priority,
        responsibleTeam: escalation.responsibleTeam,
        requestedAction: escalation.requestedAction,
        dueDate: escalation.dueDate
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти ескалацію у браузері." };
  }

  return { ok: true, record };
}

export function updateCollectionEscalation(
  invoiceId: string,
  input: CollectionEscalationInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateCollectionEscalationInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !isActiveEscalation(existing.escalation)) {
    return { ok: false, error: "Активну ескалацію для цього рахунку не знайдено." };
  }

  const previous = existing.escalation!;
  const unchanged =
    previous.reason === validation.reason &&
    previous.priority === validation.priority &&
    previous.responsibleTeam === validation.responsibleTeam &&
    previous.requestedAction === validation.requestedAction &&
    previous.dueDate === validation.dueDate;
  if (unchanged) {
    return { ok: true, record: existing };
  }

  const escalation: CollectionEscalation = {
    ...previous,
    reason: validation.reason,
    priority: validation.priority,
    responsibleTeam: validation.responsibleTeam,
    requestedAction: validation.requestedAction,
    dueDate: validation.dueDate,
    updatedAtUtc: now.toISOString()
  };

  const record: PromiseToPayRecord = {
    ...existing,
    escalation,
    updatedAtUtc: now.toISOString(),
    history: historyAfterEscalationChange(
      existing,
      "escalation_updated",
      {
        reason: escalation.reason,
        priority: escalation.priority,
        responsibleTeam: escalation.responsibleTeam,
        requestedAction: escalation.requestedAction,
        dueDate: escalation.dueDate,
        previousTeam: previous.responsibleTeam
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося оновити ескалацію у браузері." };
  }

  return { ok: true, record };
}

export function completeCollectionEscalation(
  invoiceId: string,
  input: EscalationCompleteInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateEscalationCompleteInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !isActiveEscalation(existing.escalation)) {
    return { ok: false, error: "Активну ескалацію для цього рахунку не знайдено." };
  }

  const at = now.toISOString();
  const escalation: CollectionEscalation = {
    ...existing.escalation!,
    status: "completed",
    completionComment: validation.comment,
    completedAtUtc: at,
    updatedAtUtc: at
  };

  const record: PromiseToPayRecord = {
    ...existing,
    escalation,
    updatedAtUtc: at,
    history: historyAfterEscalationChange(
      existing,
      "escalation_completed",
      {
        reason: escalation.reason,
        priority: escalation.priority,
        responsibleTeam: escalation.responsibleTeam,
        requestedAction: escalation.requestedAction,
        dueDate: escalation.dueDate,
        completionComment: validation.comment
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося завершити ескалацію у браузері." };
  }

  return { ok: true, record };
}

/**
 * True when the case has an open simple Promise commitment that a payment plan would replace.
 * Completed / paid cases and cases that already only track contact/dispute/escalation without
 * an awaiting promise still require explicit replace when status is open and no active plan.
 */
export function hasActivePromiseCommitment(
  record: PromiseToPayRecord | null | undefined
): boolean {
  if (!record) {
    return false;
  }
  if (record.status === "completed" || record.resolution?.kind === "paid") {
    return false;
  }
  if (isActivePaymentPlan(record.paymentPlan)) {
    return false;
  }
  return Boolean(record.promiseDate);
}

/**
 * Create an active payment plan on the durable collection case record.
 * Operational tracking only — does not post ledger payments or resolve the invoice.
 */
export function createPaymentPlan(
  invoiceId: string,
  input: PaymentPlanCreateInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validatePaymentPlanCreateInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (isActivePaymentPlan(existing?.paymentPlan)) {
    return {
      ok: false,
      error: "Активний payment plan уже існує. Завершіть або скасуйте поточний план."
    };
  }
  if (hasActivePromiseCommitment(existing) && !validation.replaceActivePromise) {
    return {
      ok: false,
      error:
        "Активна Promise to Pay існує. Підтвердіть заміну простим планом погашення (replaceActivePromise)."
    };
  }

  const paymentPlan = createPaymentPlanEntity(invoiceId, validation, now);
  const firstDue = paymentPlan.installments[0]?.dueDate ?? localCalendarDateString(now);
  const promiseDate = firstDue;
  const at = now.toISOString();
  const replacedNote = hasActivePromiseCommitment(existing)
    ? `Replaced Promise to Pay (${existing!.promiseDate}) with payment plan ${paymentPlan.planAmount.toFixed(2)} ${paymentPlan.currency}, ${paymentPlan.installments.length} installment(s)`
    : `Payment plan ${paymentPlan.planAmount.toFixed(2)} ${paymentPlan.currency}, ${paymentPlan.installments.length} installment(s)`;

  const draftBase: PromiseToPayRecord = {
    invoiceId: invoiceId.trim(),
    promiseDate,
    note: existing?.note ?? "",
    status: existing?.status === "completed" ? "awaiting" : existing?.status ?? "awaiting",
    updatedAtUtc: at,
    completedAtUtc: null,
    resolution:
      existing?.resolution?.kind === "paid" ? null : existing?.resolution ?? null,
    nextFollowUpAt: existing?.nextFollowUpAt ?? null,
    lastContact: existing?.lastContact ?? null,
    dispute: existing?.dispute ?? null,
    escalation: existing?.escalation ?? null,
    paymentPlan,
    notes: existing?.notes ?? [],
    history: existing?.history ?? []
  };

  const record: PromiseToPayRecord = {
    ...draftBase,
    history: historyAfterPaymentPlanChange(
      existing,
      "payment_plan_created",
      {
        note: replacedNote,
        promiseDate,
        followUpAt: firstDue
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти payment plan у браузері." };
  }

  return { ok: true, record };
}

/**
 * Update future unpaid installments on an active payment plan.
 */
export function updatePaymentPlan(
  invoiceId: string,
  input: PaymentPlanUpdateInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !isActivePaymentPlan(existing.paymentPlan)) {
    return { ok: false, error: "Активний payment plan для цього рахунку не знайдено." };
  }

  const previous = existing.paymentPlan!;
  const validation = validatePaymentPlanUpdateInput(input, previous);
  if (!validation.ok) {
    return validation;
  }

  const installments = buildInstallmentsFromValidated(previous.id, validation, previous);
  const nextPlan: CollectionPaymentPlan = {
    ...previous,
    planAmount: validation.planAmount,
    installments,
    updatedAtUtc: now.toISOString()
  };

  const summary = summarizePlanUpdate(previous, nextPlan);
  if (summary === "schedule unchanged") {
    return { ok: true, record: existing };
  }

  const nextDue = selectNextInstallment(nextPlan, now)?.dueDate ?? null;
  const record: PromiseToPayRecord = {
    ...existing,
    promiseDate: nextDue ?? existing.promiseDate,
    paymentPlan: nextPlan,
    updatedAtUtc: now.toISOString(),
    history: historyAfterPaymentPlanChange(
      existing,
      "payment_plan_updated",
      {
        note: summary,
        promiseDate: nextDue ?? existing.promiseDate,
        followUpAt: nextDue
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося оновити payment plan у браузері." };
  }

  return { ok: true, record };
}

/**
 * Record an operational installment payment (collections tracking — not ledger posting).
 */
export function recordInstallmentPayment(
  invoiceId: string,
  input: InstallmentPaymentInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }
  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !existing.paymentPlan) {
    return { ok: false, error: "Payment plan для цього рахунку не знайдено." };
  }
  if (existing.paymentPlan.status === "Cancelled") {
    return { ok: false, error: "Скасований план не можна змінювати." };
  }
  if (existing.paymentPlan.status === "Completed") {
    return { ok: false, error: "Завершений план не можна змінювати." };
  }

  const validation = validateInstallmentPaymentInput(input, existing.paymentPlan, now);
  if (!validation.ok) {
    return validation;
  }

  const at = now.toISOString();
  const installments = existing.paymentPlan.installments.map((item) =>
    item.id === validation.installment.id
      ? {
          ...item,
          recordedPaidAmount: validation.nextPaid,
          lastPaymentAtUtc: at
        }
      : item
  );
  let paymentPlan: CollectionPaymentPlan = {
    ...existing.paymentPlan,
    installments,
    updatedAtUtc: at
  };

  const paymentNote = [
    `#${validation.installment.sequence}`,
    `${validation.amount.toFixed(2)} ${paymentPlan.currency}`,
    `paid ${validation.nextPaid.toFixed(2)}`,
    `remaining ${validation.remainingAfter.toFixed(2)}`,
    validation.note || null
  ]
    .filter(Boolean)
    .join(" · ");

  let history = historyAfterPaymentPlanChange(
    existing,
    "installment_payment_recorded",
    {
      note: paymentNote,
      promiseDate: existing.promiseDate,
      followUpAt: selectNextInstallment(paymentPlan, now)?.dueDate ?? null
    },
    now
  );

  const completion = applyPlanCompletionIfNeeded(paymentPlan, now);
  paymentPlan = completion.plan;
  if (completion.justCompleted) {
    history = historyAfterPaymentPlanChange(
      { ...existing, history },
      "payment_plan_completed",
      {
        note: `Plan ${paymentPlan.planAmount.toFixed(2)} ${paymentPlan.currency} fully recorded`,
        promiseDate: existing.promiseDate,
        followUpAt: null
      },
      now
    );
  }

  const nextDue = selectNextInstallment(paymentPlan, now)?.dueDate ?? null;
  const record: PromiseToPayRecord = {
    ...existing,
    promiseDate: nextDue ?? existing.promiseDate,
    paymentPlan,
    updatedAtUtc: at,
    history
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося записати платіж у браузері." };
  }

  return { ok: true, record };
}

/**
 * Cancel an active payment plan with a required reason.
 */
export function cancelPaymentPlan(
  invoiceId: string,
  input: PaymentPlanCancelInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validatePaymentPlanCancelInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing || !isActivePaymentPlan(existing.paymentPlan)) {
    return { ok: false, error: "Активний payment plan для цього рахунку не знайдено." };
  }

  const at = now.toISOString();
  const paymentPlan: CollectionPaymentPlan = {
    ...existing.paymentPlan!,
    status: "Cancelled",
    cancelledAtUtc: at,
    cancellationReason: validation.reason,
    updatedAtUtc: at
  };

  const record: PromiseToPayRecord = {
    ...existing,
    paymentPlan,
    updatedAtUtc: at,
    history: historyAfterPaymentPlanChange(
      existing,
      "payment_plan_cancelled",
      {
        note: validation.reason,
        promiseDate: existing.promiseDate,
        followUpAt: null
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося скасувати payment plan у браузері." };
  }

  return { ok: true, record };
}

const NOTE_AUTHOR_STORAGE_KEY = "vectorflow.finance.collectionNoteAuthor";

export function readLastCollectionNoteAuthor(
  storage: Storage | null | undefined = defaultStorage()
): string {
  if (!storage) {
    return "";
  }
  try {
    const raw = storage.getItem(NOTE_AUTHOR_STORAGE_KEY);
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}

function writeLastCollectionNoteAuthor(
  author: string,
  storage: Storage | null | undefined
): void {
  if (!storage) {
    return;
  }
  try {
    const trimmed = author.trim();
    if (!trimmed) {
      storage.removeItem(NOTE_AUTHOR_STORAGE_KEY);
      return;
    }
    storage.setItem(NOTE_AUTHOR_STORAGE_KEY, trimmed);
  } catch {
    // Ignore author preference write failures.
  }
}

function ensureCaseShellForNotes(
  invoiceId: string,
  existing: PromiseToPayRecord | null,
  now: Date
): PromiseToPayRecord {
  if (existing) {
    return existing;
  }
  const at = now.toISOString();
  return {
    invoiceId: invoiceId.trim(),
    promiseDate: localCalendarDateString(now),
    note: "",
    status: "awaiting",
    updatedAtUtc: at,
    completedAtUtc: null,
    resolution: null,
    nextFollowUpAt: null,
    lastContact: null,
    dispute: null,
    escalation: null,
    paymentPlan: null,
    notes: [],
    history: []
  };
}

/**
 * Add an internal collaboration note to the collection case.
 * Creates a minimal case record when none exists yet.
 */
export function addCollectionNote(
  invoiceId: string,
  input: CollectionNoteInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateCollectionNoteInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  const base = ensureCaseShellForNotes(invoiceId, existing, now);
  const note = createCollectionNoteEntity(invoiceId, validation, now);
  const notes = [...base.notes, note];
  const at = now.toISOString();

  const record: PromiseToPayRecord = {
    ...base,
    notes,
    updatedAtUtc: at,
    history: historyAfterNoteChange(
      existing,
      "note_added",
      {
        note: summarizeNoteForHistory(note),
        promiseDate: base.promiseDate
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося зберегти нотатку у браузері." };
  }
  writeLastCollectionNoteAuthor(validation.author, storage);

  return { ok: true, record };
}

/**
 * Update an active (non-archived) internal note.
 */
export function updateCollectionNote(
  invoiceId: string,
  input: CollectionNoteUpdateInput,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  const validation = validateCollectionNoteInput(input);
  if (!validation.ok) {
    return validation;
  }
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }
  const noteId = (input.noteId ?? "").trim();
  if (!noteId) {
    return { ok: false, error: "Некоректний ідентифікатор нотатки." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing) {
    return { ok: false, error: "Кейс стягнення для цього рахунку не знайдено." };
  }

  const index = existing.notes.findIndex((item) => item.id === noteId);
  if (index < 0) {
    return { ok: false, error: "Нотатку не знайдено." };
  }
  const previous = existing.notes[index]!;
  if (!isActiveCollectionNote(previous)) {
    return { ok: false, error: "Архівовану нотатку не можна редагувати." };
  }

  const unchanged =
    previous.body === validation.body &&
    previous.author === validation.author &&
    previous.category === validation.category &&
    previous.pinned === validation.pinned;
  if (unchanged) {
    return { ok: true, record: existing };
  }

  const at = now.toISOString();
  const nextNote: CollectionNote = {
    ...previous,
    body: validation.body,
    author: validation.author,
    category: validation.category,
    pinned: validation.pinned,
    updatedAtUtc: at
  };
  const notes = existing.notes.map((item, itemIndex) =>
    itemIndex === index ? nextNote : item
  );

  const record: PromiseToPayRecord = {
    ...existing,
    notes,
    updatedAtUtc: at,
    history: historyAfterNoteChange(
      existing,
      "note_updated",
      {
        note: summarizeNoteForHistory(nextNote),
        promiseDate: existing.promiseDate
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося оновити нотатку у браузері." };
  }
  writeLastCollectionNoteAuthor(validation.author, storage);

  return { ok: true, record };
}

/**
 * Soft-archive an internal note (keeps history; removes from active thread).
 */
export function archiveCollectionNote(
  invoiceId: string,
  noteId: string,
  options?: { storage?: Storage | null; now?: Date }
): { ok: true; record: PromiseToPayRecord } | { ok: false; error: string } {
  if (!UUID_RE.test(invoiceId.trim())) {
    return { ok: false, error: "Некоректний ідентифікатор рахунку." };
  }
  const id = noteId.trim();
  if (!id) {
    return { ok: false, error: "Некоректний ідентифікатор нотатки." };
  }

  const storage = options?.storage === undefined ? defaultStorage() : options.storage;
  const now = options?.now ?? new Date();
  const existing = readPromiseFromStorage(invoiceId, storage);
  if (!existing) {
    return { ok: false, error: "Кейс стягнення для цього рахунку не знайдено." };
  }

  const index = existing.notes.findIndex((item) => item.id === id);
  if (index < 0) {
    return { ok: false, error: "Нотатку не знайдено." };
  }
  const previous = existing.notes[index]!;
  if (!isActiveCollectionNote(previous)) {
    return { ok: true, record: existing };
  }

  const at = now.toISOString();
  const nextNote: CollectionNote = {
    ...previous,
    pinned: false,
    archivedAtUtc: at,
    updatedAtUtc: at
  };
  const notes = existing.notes.map((item, itemIndex) =>
    itemIndex === index ? nextNote : item
  );

  const record: PromiseToPayRecord = {
    ...existing,
    notes,
    updatedAtUtc: at,
    history: historyAfterNoteChange(
      existing,
      "note_archived",
      {
        note: summarizeNoteForHistory(nextNote),
        promiseDate: existing.promiseDate
      },
      now
    )
  };

  if (storage && !writePromiseToStorage(record, storage)) {
    return { ok: false, error: "Не вдалося архівувати нотатку у браузері." };
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
  const nextAction = resolveNextAction(record);
  const nextActionDate = nextAction?.date ?? record.promiseDate;
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
    lastContact: record.lastContact,
    dispute: record.dispute,
    disputeReviewAt:
      isActiveDispute(record.dispute) && record.dispute?.nextReviewAt
        ? record.dispute.nextReviewAt
        : null,
    escalation: record.escalation,
    escalationDueAt:
      isActiveEscalation(record.escalation) && record.escalation?.dueDate
        ? record.escalation.dueDate
        : null,
    escalationOverdue: isEscalationOverdue(record.escalation, now),
    paymentPlan: record.paymentPlan,
    paymentPlanAmount: isActivePaymentPlan(record.paymentPlan)
      ? record.paymentPlan!.planAmount
      : record.paymentPlan?.status === "Completed" ||
          record.paymentPlan?.status === "Cancelled"
        ? record.paymentPlan.planAmount
        : null,
    paymentPlanPaidTotal: record.paymentPlan ? planPaidTotal(record.paymentPlan) : null,
    paymentPlanRemainingTotal: record.paymentPlan
      ? Math.max(0, record.paymentPlan.planAmount - planPaidTotal(record.paymentPlan))
      : null,
    paymentPlanNextDueAt:
      isActivePaymentPlan(record.paymentPlan) && record.paymentPlan
        ? selectNextInstallment(record.paymentPlan, now)?.dueDate ?? null
        : null,
    paymentPlanOverdue: hasOverdueInstallment(record.paymentPlan, now),
    paymentPlanProgress: record.paymentPlan
      ? record.paymentPlan.planAmount > 0
        ? Math.min(1, planPaidTotal(record.paymentPlan) / record.paymentPlan.planAmount)
        : 0
      : null,
    notes: record.notes,
    activeNotesCount: listActiveCollectionNotes(record.notes).length,
    pinnedNotesCount: listPinnedCollectionNotes(record.notes).length,
    hasOpenHandoffNotes: hasOpenHandoffNotes(record.notes),
    nextActionKind: nextAction?.kind ?? null,
    nextActionLabel: nextAction?.label ?? null
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
    payment_plans: 3,
    disputed: 4,
    escalated: 5,
    upcoming: 6,
    completed: 7
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
    escalated: [],
    payment_plans: []
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
