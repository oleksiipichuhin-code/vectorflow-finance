/**
 * Collection case activity timeline — extends PromiseToPayRecord.history
 * (same localStorage key). No separate history store.
 */

import {
  calendarDayDiff,
  localCalendarDateString
} from "./invoiceDueDateAging.ts";
import type {
  CollectionResolution,
  PromiseFollowUpStatus,
  PromiseToPayRecord
} from "./promiseToPay.ts";

export type CollectionActivityEventType =
  | "promise_created"
  | "promise_updated"
  | "promise_broken"
  | "follow_up_required"
  | "contacted"
  | "contact_logged"
  | "paid"
  | "partially_paid"
  | "new_promise"
  | "disputed"
  | "dispute_raised"
  | "dispute_updated"
  | "dispute_resolved"
  | "dispute_rejected"
  | "escalated"
  | "case_escalated"
  | "escalation_updated"
  | "escalation_completed"
  | "payment_plan_created"
  | "payment_plan_updated"
  | "installment_payment_recorded"
  | "payment_plan_completed"
  | "payment_plan_cancelled"
  | "note_added"
  | "note_updated"
  | "note_archived"
  | "unable_to_contact"
  | "completed";

export type CollectionActivityEventTypeFilter = "" | CollectionActivityEventType;

export type ContactChannel = "phone" | "email" | "message" | "other";

export type ContactResult =
  | "reached"
  | "no_answer"
  | "left_message"
  | "disputed"
  | "payment_promised"
  | "other";

export type DisputeReason =
  | "incorrect_amount"
  | "duplicate_invoice"
  | "service_not_received"
  | "missing_documents"
  | "contract_mismatch"
  | "other";

export type DisputeParty =
  | "collections"
  | "finance"
  | "customer"
  | "operations"
  | "other";

export type EscalationReason =
  | "broken_promise"
  | "repeated_no_response"
  | "active_dispute"
  | "high_outstanding_balance"
  | "due_date_exceeded"
  | "documentation_required"
  | "other";

export type EscalationPriority = "normal" | "high" | "critical";

export type EscalationTeam =
  | "collections"
  | "finance"
  | "operations"
  | "account_management"
  | "legal"
  | "other";

export type CollectionActivityEvent = {
  id: string;
  type: CollectionActivityEventType;
  atUtc: string;
  description: string;
  note: string | null;
  promiseDate: string | null;
  contactChannel: ContactChannel | null;
  contactResult: ContactResult | null;
  followUpAt: string | null;
  disputeReason: DisputeReason | null;
  disputeParty: DisputeParty | null;
  escalationReason: EscalationReason | null;
  escalationTeam: EscalationTeam | null;
  escalationPriority: EscalationPriority | null;
};

export type CaseHistorySummary = {
  currentStatus: string;
  currentPromise: string | null;
  lastContactAtUtc: string | null;
  lastResolutionLabel: string | null;
  totalFollowUps: number;
  totalPromises: number;
};

export type CaseHistoryView = {
  summary: CaseHistorySummary;
  events: CollectionActivityEvent[];
  totalCount: number;
  visibleCount: number;
  collapsed: boolean;
};

export type CaseHistoryQuery = {
  type?: CollectionActivityEventTypeFilter;
  search?: string;
  expanded?: boolean;
  collapsedLimit?: number;
};

export const HISTORY_COLLAPSED_LIMIT = 5;

export const ACTIVITY_EVENT_TYPE_OPTIONS: readonly {
  id: CollectionActivityEventTypeFilter;
  label: string;
}[] = [
  { id: "", label: "Усі події" },
  { id: "promise_created", label: "Promise created" },
  { id: "promise_updated", label: "Promise updated" },
  { id: "promise_broken", label: "Promise broken" },
  { id: "follow_up_required", label: "Follow-up required" },
  { id: "contacted", label: "Contacted" },
  { id: "contact_logged", label: "Contact logged" },
  { id: "paid", label: "Paid" },
  { id: "partially_paid", label: "Partially paid" },
  { id: "new_promise", label: "New promise" },
  { id: "disputed", label: "Disputed" },
  { id: "dispute_raised", label: "Dispute raised" },
  { id: "dispute_updated", label: "Dispute updated" },
  { id: "dispute_resolved", label: "Dispute resolved" },
  { id: "dispute_rejected", label: "Dispute rejected" },
  { id: "escalated", label: "Escalated" },
  { id: "case_escalated", label: "Case escalated" },
  { id: "escalation_updated", label: "Escalation updated" },
  { id: "escalation_completed", label: "Escalation completed" },
  { id: "payment_plan_created", label: "Payment plan created" },
  { id: "payment_plan_updated", label: "Payment plan updated" },
  { id: "installment_payment_recorded", label: "Installment payment recorded" },
  { id: "payment_plan_completed", label: "Payment plan completed" },
  { id: "payment_plan_cancelled", label: "Payment plan cancelled" },
  { id: "note_added", label: "Note added" },
  { id: "note_updated", label: "Note updated" },
  { id: "note_archived", label: "Note archived" },
  { id: "unable_to_contact", label: "Unable to contact" },
  { id: "completed", label: "Completed" }
];

export const CONTACT_CHANNEL_OPTIONS: readonly {
  id: ContactChannel;
  label: string;
}[] = [
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "message", label: "Message" },
  { id: "other", label: "Other" }
];

export const CONTACT_RESULT_OPTIONS: readonly {
  id: ContactResult;
  label: string;
}[] = [
  { id: "reached", label: "Reached" },
  { id: "no_answer", label: "No answer" },
  { id: "left_message", label: "Left message" },
  { id: "disputed", label: "Disputed" },
  { id: "payment_promised", label: "Payment promised" },
  { id: "other", label: "Other" }
];

export const DISPUTE_REASON_OPTIONS: readonly {
  id: DisputeReason;
  label: string;
}[] = [
  { id: "incorrect_amount", label: "Incorrect amount" },
  { id: "duplicate_invoice", label: "Duplicate invoice" },
  { id: "service_not_received", label: "Service not received" },
  { id: "missing_documents", label: "Missing documents" },
  { id: "contract_mismatch", label: "Contract mismatch" },
  { id: "other", label: "Other" }
];

export const DISPUTE_PARTY_OPTIONS: readonly {
  id: DisputeParty;
  label: string;
}[] = [
  { id: "collections", label: "Collections" },
  { id: "finance", label: "Finance" },
  { id: "customer", label: "Customer" },
  { id: "operations", label: "Operations" },
  { id: "other", label: "Other" }
];

export const ESCALATION_REASON_OPTIONS: readonly {
  id: EscalationReason;
  label: string;
}[] = [
  { id: "broken_promise", label: "Broken promise" },
  { id: "repeated_no_response", label: "Repeated no response" },
  { id: "active_dispute", label: "Active dispute" },
  { id: "high_outstanding_balance", label: "High outstanding balance" },
  { id: "due_date_exceeded", label: "Due date exceeded" },
  { id: "documentation_required", label: "Documentation required" },
  { id: "other", label: "Other" }
];

export const ESCALATION_PRIORITY_OPTIONS: readonly {
  id: EscalationPriority;
  label: string;
}[] = [
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "critical", label: "Critical" }
];

export const ESCALATION_TEAM_OPTIONS: readonly {
  id: EscalationTeam;
  label: string;
}[] = [
  { id: "collections", label: "Collections" },
  { id: "finance", label: "Finance" },
  { id: "operations", label: "Operations" },
  { id: "account_management", label: "Account Management" },
  { id: "legal", label: "Legal" },
  { id: "other", label: "Other" }
];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(
  ACTIVITY_EVENT_TYPE_OPTIONS.map((option) => option.id).filter(Boolean)
);

const CONTACT_CHANNEL_SET: ReadonlySet<string> = new Set(
  CONTACT_CHANNEL_OPTIONS.map((option) => option.id)
);

const CONTACT_RESULT_SET: ReadonlySet<string> = new Set(
  CONTACT_RESULT_OPTIONS.map((option) => option.id)
);

const DISPUTE_REASON_SET: ReadonlySet<string> = new Set(
  DISPUTE_REASON_OPTIONS.map((option) => option.id)
);

const DISPUTE_PARTY_SET: ReadonlySet<string> = new Set(
  DISPUTE_PARTY_OPTIONS.map((option) => option.id)
);

const ESCALATION_REASON_SET: ReadonlySet<string> = new Set(
  ESCALATION_REASON_OPTIONS.map((option) => option.id)
);

const ESCALATION_PRIORITY_SET: ReadonlySet<string> = new Set(
  ESCALATION_PRIORITY_OPTIONS.map((option) => option.id)
);

const ESCALATION_TEAM_SET: ReadonlySet<string> = new Set(
  ESCALATION_TEAM_OPTIONS.map((option) => option.id)
);

const EVENT_LABELS: Record<CollectionActivityEventType, string> = {
  promise_created: "Promise created",
  promise_updated: "Promise updated",
  promise_broken: "Promise broken",
  follow_up_required: "Follow-up required",
  contacted: "Contacted",
  contact_logged: "Contact logged",
  paid: "Paid",
  partially_paid: "Partially paid",
  new_promise: "New promise",
  disputed: "Disputed",
  dispute_raised: "Dispute raised",
  dispute_updated: "Dispute updated",
  dispute_resolved: "Dispute resolved",
  dispute_rejected: "Dispute rejected",
  escalated: "Escalated",
  case_escalated: "Case escalated",
  escalation_updated: "Escalation updated",
  escalation_completed: "Escalation completed",
  payment_plan_created: "Payment plan created",
  payment_plan_updated: "Payment plan updated",
  installment_payment_recorded: "Installment payment recorded",
  payment_plan_completed: "Payment plan completed",
  payment_plan_cancelled: "Payment plan cancelled",
  note_added: "Note added",
  note_updated: "Note updated",
  note_archived: "Note archived",
  unable_to_contact: "Unable to contact",
  completed: "Completed"
};

const STATUS_LABELS: Record<PromiseFollowUpStatus, string> = {
  awaiting: "Очікується",
  follow_up_required: "Потрібен повторний контакт",
  contacted: "Контакт виконано",
  completed: "Завершено"
};

const RESOLUTION_LABELS: Record<CollectionResolution["kind"], string> = {
  paid: "Paid",
  partially_paid: "Partially Paid",
  new_promise: "New Promise",
  disputed: "Disputed",
  escalated: "Escalated",
  unable_to_contact: "Unable to Contact"
};

export function activityEventTypeLabel(type: CollectionActivityEventType): string {
  return EVENT_LABELS[type] ?? type;
}

export function contactChannelLabel(channel: ContactChannel): string {
  return CONTACT_CHANNEL_OPTIONS.find((option) => option.id === channel)?.label ?? channel;
}

export function contactResultLabel(result: ContactResult): string {
  return CONTACT_RESULT_OPTIONS.find((option) => option.id === result)?.label ?? result;
}

export function disputeReasonLabel(reason: DisputeReason): string {
  return DISPUTE_REASON_OPTIONS.find((option) => option.id === reason)?.label ?? reason;
}

export function disputePartyLabel(party: DisputeParty): string {
  return DISPUTE_PARTY_OPTIONS.find((option) => option.id === party)?.label ?? party;
}

export function escalationReasonLabel(reason: EscalationReason): string {
  return (
    ESCALATION_REASON_OPTIONS.find((option) => option.id === reason)?.label ?? reason
  );
}

export function escalationPriorityLabel(priority: EscalationPriority): string {
  return (
    ESCALATION_PRIORITY_OPTIONS.find((option) => option.id === priority)?.label ??
    priority
  );
}

export function escalationTeamLabel(team: EscalationTeam): string {
  return ESCALATION_TEAM_OPTIONS.find((option) => option.id === team)?.label ?? team;
}

export function parseContactChannel(value: string | null | undefined): ContactChannel | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return CONTACT_CHANNEL_SET.has(trimmed) ? (trimmed as ContactChannel) : null;
}

export function parseContactResult(value: string | null | undefined): ContactResult | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return CONTACT_RESULT_SET.has(trimmed) ? (trimmed as ContactResult) : null;
}

export function parseDisputeReason(value: string | null | undefined): DisputeReason | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return DISPUTE_REASON_SET.has(trimmed) ? (trimmed as DisputeReason) : null;
}

export function parseDisputeParty(value: string | null | undefined): DisputeParty | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return DISPUTE_PARTY_SET.has(trimmed) ? (trimmed as DisputeParty) : null;
}

export function parseEscalationReason(
  value: string | null | undefined
): EscalationReason | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return ESCALATION_REASON_SET.has(trimmed) ? (trimmed as EscalationReason) : null;
}

export function parseEscalationPriority(
  value: string | null | undefined
): EscalationPriority | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return ESCALATION_PRIORITY_SET.has(trimmed) ? (trimmed as EscalationPriority) : null;
}

export function parseEscalationTeam(value: string | null | undefined): EscalationTeam | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return ESCALATION_TEAM_SET.has(trimmed) ? (trimmed as EscalationTeam) : null;
}

export function parseHistoryEventTypeParam(
  value: string | null | undefined
): CollectionActivityEventTypeFilter {
  if (value == null) {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return EVENT_TYPE_SET.has(trimmed) ? (trimmed as CollectionActivityEventType) : "";
}

export function parseHistoryFlagParam(value: string | null | undefined): boolean {
  if (value == null) {
    return false;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true" || trimmed === "yes";
}

export function activityEventFingerprint(
  event: Pick<
    CollectionActivityEvent,
    | "type"
    | "atUtc"
    | "promiseDate"
    | "note"
    | "description"
    | "contactChannel"
    | "contactResult"
    | "followUpAt"
    | "disputeReason"
    | "disputeParty"
    | "escalationReason"
    | "escalationTeam"
    | "escalationPriority"
  >
): string {
  return [
    event.type,
    event.atUtc,
    event.promiseDate ?? "",
    event.note ?? "",
    event.description,
    event.contactChannel ?? "",
    event.contactResult ?? "",
    event.followUpAt ?? "",
    event.disputeReason ?? "",
    event.disputeParty ?? "",
    event.escalationReason ?? "",
    event.escalationTeam ?? "",
    event.escalationPriority ?? ""
  ].join("|");
}

export function createActivityEvent(input: {
  type: CollectionActivityEventType;
  atUtc: string;
  description?: string;
  note?: string | null;
  promiseDate?: string | null;
  contactChannel?: ContactChannel | null;
  contactResult?: ContactResult | null;
  followUpAt?: string | null;
  disputeReason?: DisputeReason | null;
  disputeParty?: DisputeParty | null;
  escalationReason?: EscalationReason | null;
  escalationTeam?: EscalationTeam | null;
  escalationPriority?: EscalationPriority | null;
  id?: string;
}): CollectionActivityEvent {
  const note = input.note?.trim() ? input.note.trim() : null;
  const promiseDate = input.promiseDate?.trim() ? input.promiseDate.trim() : null;
  const contactChannel = input.contactChannel ?? null;
  const contactResult = input.contactResult ?? null;
  const followUpAt = input.followUpAt?.trim() ? input.followUpAt.trim() : null;
  const disputeReason = input.disputeReason ?? null;
  const disputeParty = input.disputeParty ?? null;
  const escalationReason = input.escalationReason ?? null;
  const escalationTeam = input.escalationTeam ?? null;
  const escalationPriority = input.escalationPriority ?? null;
  const description =
    input.description?.trim() ||
    defaultDescription(
      input.type,
      promiseDate,
      note,
      contactChannel,
      contactResult,
      followUpAt,
      disputeReason,
      disputeParty,
      escalationReason,
      escalationTeam,
      escalationPriority
    );
  const draft = {
    type: input.type,
    atUtc: input.atUtc,
    description,
    note,
    promiseDate,
    contactChannel,
    contactResult,
    followUpAt,
    disputeReason,
    disputeParty,
    escalationReason,
    escalationTeam,
    escalationPriority
  };
  return {
    id: input.id?.trim() || activityEventFingerprint(draft),
    ...draft
  };
}

function defaultDescription(
  type: CollectionActivityEventType,
  promiseDate: string | null,
  note: string | null,
  contactChannel: ContactChannel | null = null,
  contactResult: ContactResult | null = null,
  followUpAt: string | null = null,
  disputeReason: DisputeReason | null = null,
  disputeParty: DisputeParty | null = null,
  escalationReason: EscalationReason | null = null,
  escalationTeam: EscalationTeam | null = null,
  escalationPriority: EscalationPriority | null = null
): string {
  if (type === "contact_logged") {
    const channel = contactChannel ? contactChannelLabel(contactChannel) : "Contact";
    const result = contactResult ? contactResultLabel(contactResult) : "logged";
    const parts = [`${channel} · ${result}`];
    if (note) {
      parts.push(note.length > 80 ? `${note.slice(0, 77)}…` : note);
    }
    if (followUpAt) {
      parts.push(`follow-up ${followUpAt}`);
    }
    return parts.join(" — ");
  }
  if (
    type === "dispute_raised" ||
    type === "dispute_updated" ||
    type === "dispute_resolved" ||
    type === "dispute_rejected"
  ) {
    const label = activityEventTypeLabel(type);
    const parts = [label];
    if (disputeReason) {
      parts.push(disputeReasonLabel(disputeReason));
    }
    if (disputeParty) {
      parts.push(disputePartyLabel(disputeParty));
    }
    let text = parts.join(" · ");
    if (note) {
      text = `${text} — ${note.length > 80 ? `${note.slice(0, 77)}…` : note}`;
    }
    if (followUpAt && (type === "dispute_raised" || type === "dispute_updated")) {
      text = `${text} (review ${followUpAt})`;
    }
    return text;
  }
  if (
    type === "case_escalated" ||
    type === "escalation_updated" ||
    type === "escalation_completed"
  ) {
    const label = activityEventTypeLabel(type);
    const parts = [label];
    if (escalationPriority) {
      parts.push(escalationPriorityLabel(escalationPriority));
    }
    if (escalationReason) {
      parts.push(escalationReasonLabel(escalationReason));
    }
    if (escalationTeam) {
      parts.push(escalationTeamLabel(escalationTeam));
    }
    let text = parts.join(" · ");
    if (note) {
      text = `${text} — ${note.length > 80 ? `${note.slice(0, 77)}…` : note}`;
    }
    if (followUpAt && (type === "case_escalated" || type === "escalation_updated")) {
      text = `${text} (due ${followUpAt})`;
    }
    return text;
  }
  if (
    type === "payment_plan_created" ||
    type === "payment_plan_updated" ||
    type === "installment_payment_recorded" ||
    type === "payment_plan_completed" ||
    type === "payment_plan_cancelled"
  ) {
    const label = activityEventTypeLabel(type);
    if (note) {
      return `${label} — ${note.length > 120 ? `${note.slice(0, 117)}…` : note}`;
    }
    return label;
  }
  const label = activityEventTypeLabel(type);
  if (type === "promise_created" || type === "promise_updated" || type === "new_promise") {
    return promiseDate ? `${label}: ${promiseDate}` : label;
  }
  if (type === "promise_broken") {
    return promiseDate ? `${label} (promised ${promiseDate})` : label;
  }
  if (note) {
    return `${label} — ${note}`;
  }
  return label;
}

export function sanitizeActivityEvent(raw: unknown): CollectionActivityEvent | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const typeRaw = typeof candidate.type === "string" ? candidate.type.trim() : "";
  if (!EVENT_TYPE_SET.has(typeRaw)) {
    return null;
  }
  const atUtc =
    typeof candidate.atUtc === "string" && candidate.atUtc.trim()
      ? candidate.atUtc.trim()
      : "";
  if (!atUtc || !Number.isFinite(Date.parse(atUtc))) {
    return null;
  }
  const note =
    typeof candidate.note === "string" && candidate.note.trim()
      ? candidate.note.trim()
      : null;
  const promiseDate =
    typeof candidate.promiseDate === "string" && candidate.promiseDate.trim()
      ? candidate.promiseDate.trim()
      : null;
  const contactChannel = parseContactChannel(
    typeof candidate.contactChannel === "string" ? candidate.contactChannel : null
  );
  const contactResult = parseContactResult(
    typeof candidate.contactResult === "string" ? candidate.contactResult : null
  );
  const followUpAt =
    typeof candidate.followUpAt === "string" && candidate.followUpAt.trim()
      ? candidate.followUpAt.trim()
      : null;
  const disputeReason = parseDisputeReason(
    typeof candidate.disputeReason === "string" ? candidate.disputeReason : null
  );
  const disputeParty = parseDisputeParty(
    typeof candidate.disputeParty === "string" ? candidate.disputeParty : null
  );
  const escalationReason = parseEscalationReason(
    typeof candidate.escalationReason === "string" ? candidate.escalationReason : null
  );
  const escalationTeam = parseEscalationTeam(
    typeof candidate.escalationTeam === "string" ? candidate.escalationTeam : null
  );
  const escalationPriority = parseEscalationPriority(
    typeof candidate.escalationPriority === "string"
      ? candidate.escalationPriority
      : null
  );
  const description =
    typeof candidate.description === "string" && candidate.description.trim()
      ? candidate.description.trim()
      : defaultDescription(
          typeRaw as CollectionActivityEventType,
          promiseDate,
          note,
          contactChannel,
          contactResult,
          followUpAt,
          disputeReason,
          disputeParty,
          escalationReason,
          escalationTeam,
          escalationPriority
        );
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : activityEventFingerprint({
          type: typeRaw as CollectionActivityEventType,
          atUtc,
          promiseDate,
          note,
          description,
          contactChannel,
          contactResult,
          followUpAt,
          disputeReason,
          disputeParty,
          escalationReason,
          escalationTeam,
          escalationPriority
        });
  return {
    id,
    type: typeRaw as CollectionActivityEventType,
    atUtc,
    description,
    note,
    promiseDate,
    contactChannel,
    contactResult,
    followUpAt,
    disputeReason,
    disputeParty,
    escalationReason,
    escalationTeam,
    escalationPriority
  };
}

export function sanitizeActivityHistory(raw: unknown): CollectionActivityEvent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const events: CollectionActivityEvent[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const event = sanitizeActivityEvent(item);
    if (!event) {
      continue;
    }
    const key = event.id || activityEventFingerprint(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    events.push(event);
  }
  return events;
}

/**
 * Append an event if its fingerprint is not already present (duplicate prevention).
 */
export function appendActivityEvent(
  history: readonly CollectionActivityEvent[] | null | undefined,
  event: CollectionActivityEvent
): CollectionActivityEvent[] {
  const current = sanitizeActivityHistory(history ?? []);
  const fingerprint = event.id || activityEventFingerprint(event);
  if (current.some((item) => (item.id || activityEventFingerprint(item)) === fingerprint)) {
    return current;
  }
  return [...current, event];
}

export function compareActivityEventsDesc(
  a: CollectionActivityEvent,
  b: CollectionActivityEvent
): number {
  if (a.atUtc !== b.atUtc) {
    return a.atUtc < b.atUtc ? 1 : -1;
  }
  if (a.type !== b.type) {
    return a.type < b.type ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function backfillCreatedEvent(record: PromiseToPayRecord): CollectionActivityEvent {
  return createActivityEvent({
    type: "promise_created",
    atUtc: record.updatedAtUtc || new Date(0).toISOString(),
    promiseDate: record.promiseDate,
    note: record.note || null,
    description: `Promise created: ${record.promiseDate}`
  });
}

function isPromiseBroken(promiseDate: string, now: Date): boolean {
  const today = localCalendarDateString(now);
  const relative = calendarDayDiff(today, promiseDate.trim());
  return relative != null && relative < 0;
}

function brokenEventFor(
  record: PromiseToPayRecord,
  now: Date
): CollectionActivityEvent | null {
  if (!isPromiseBroken(record.promiseDate, now)) {
    return null;
  }
  if (record.status === "completed" || record.resolution?.kind === "paid") {
    return null;
  }
  return createActivityEvent({
    id: `promise_broken|${record.promiseDate}`,
    type: "promise_broken",
    atUtc: `${record.promiseDate}T23:59:59.000Z`,
    promiseDate: record.promiseDate,
    note: record.note || null,
    description: `Promise broken (promised ${record.promiseDate})`
  });
}

/**
 * Build reverse-chronological timeline from persisted history + safe synthesis.
 */
export function buildCaseTimeline(
  record: PromiseToPayRecord | null | undefined,
  now: Date = new Date()
): CollectionActivityEvent[] {
  if (!record) {
    return [];
  }
  let events = sanitizeActivityHistory(record.history);
  if (events.length === 0) {
    events = [backfillCreatedEvent(record)];
  }
  const broken = brokenEventFor(record, now);
  if (broken) {
    events = appendActivityEvent(events, broken);
  }
  return events.slice().sort(compareActivityEventsDesc);
}

export function filterCaseTimeline(
  events: readonly CollectionActivityEvent[],
  options: { type?: CollectionActivityEventTypeFilter; search?: string } = {}
): CollectionActivityEvent[] {
  const type = options.type ?? "";
  const search = (options.search ?? "").trim().toLowerCase();
  return events.filter((event) => {
    if (type && event.type !== type) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack =
      `${event.description} ${event.note ?? ""} ${event.promiseDate ?? ""} ${event.followUpAt ?? ""} ${event.contactChannel ?? ""} ${event.contactResult ?? ""} ${event.disputeReason ?? ""} ${event.disputeParty ?? ""} ${event.escalationReason ?? ""} ${event.escalationTeam ?? ""} ${event.escalationPriority ?? ""} ${activityEventTypeLabel(event.type)}`.toLowerCase();
    return haystack.includes(search);
  });
}

export function buildCaseHistorySummary(
  record: PromiseToPayRecord | null | undefined,
  events: readonly CollectionActivityEvent[] = record ? buildCaseTimeline(record) : []
): CaseHistorySummary {
  if (!record) {
    return {
      currentStatus: "—",
      currentPromise: null,
      lastContactAtUtc: null,
      lastResolutionLabel: null,
      totalFollowUps: 0,
      totalPromises: 0
    };
  }

  const lastContact = events.find(
    (event) =>
      event.type === "contact_logged" ||
      event.type === "contacted" ||
      event.type === "unable_to_contact" ||
      event.type === "follow_up_required"
  );

  const totalFollowUps = events.filter(
    (event) =>
      event.type === "follow_up_required" ||
      event.type === "contact_logged" ||
      event.type === "contacted" ||
      event.type === "unable_to_contact"
  ).length;

  const totalPromises = events.filter(
    (event) =>
      event.type === "promise_created" ||
      event.type === "promise_updated" ||
      event.type === "new_promise"
  ).length;

  return {
    currentStatus: STATUS_LABELS[record.status] ?? record.status,
    currentPromise: record.promiseDate,
    lastContactAtUtc: lastContact?.atUtc ?? null,
    lastResolutionLabel: record.resolution
      ? RESOLUTION_LABELS[record.resolution.kind]
      : null,
    totalFollowUps,
    totalPromises
  };
}

export function buildCaseHistoryView(
  record: PromiseToPayRecord | null | undefined,
  options: CaseHistoryQuery = {},
  now: Date = new Date()
): CaseHistoryView {
  const all = buildCaseTimeline(record, now);
  const filtered = filterCaseTimeline(all, {
    type: options.type,
    search: options.search
  });
  const expanded = options.expanded === true;
  const limit = options.collapsedLimit ?? HISTORY_COLLAPSED_LIMIT;
  const collapsed = !expanded && filtered.length > limit;
  const events = collapsed ? filtered.slice(0, limit) : filtered;
  return {
    summary: buildCaseHistorySummary(record, all),
    events,
    totalCount: filtered.length,
    visibleCount: events.length,
    collapsed
  };
}

export function eventTypeForStatusChange(
  nextStatus: PromiseFollowUpStatus
): CollectionActivityEventType | null {
  switch (nextStatus) {
    case "follow_up_required":
      return "follow_up_required";
    case "contacted":
      return "contacted";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

export function eventTypeForResolution(
  resolution: CollectionResolution
): CollectionActivityEventType {
  return resolution.kind;
}

export function historyAfterPromiseSave(
  existing: PromiseToPayRecord | null,
  next: PromiseToPayRecord,
  now: Date = new Date()
): CollectionActivityEvent[] {
  const type: CollectionActivityEventType = existing ? "promise_updated" : "promise_created";
  return appendActivityEvent(
    existing?.history ?? next.history,
    createActivityEvent({
      type,
      atUtc: now.toISOString(),
      promiseDate: next.promiseDate,
      note: next.note || null
    })
  );
}

export function historyAfterStatusChange(
  existing: PromiseToPayRecord,
  nextStatus: PromiseFollowUpStatus,
  now: Date = new Date()
): CollectionActivityEvent[] {
  let history = existing.history ?? [];
  const type = eventTypeForStatusChange(nextStatus);
  if (type) {
    history = appendActivityEvent(
      history,
      createActivityEvent({
        type,
        atUtc: now.toISOString(),
        promiseDate: existing.promiseDate,
        note: existing.note || null
      })
    );
  }
  if (nextStatus === "completed" && existing.resolution?.kind !== "paid") {
    history = appendActivityEvent(
      history,
      createActivityEvent({
        type: "paid",
        atUtc: now.toISOString(),
        promiseDate: existing.promiseDate,
        note: existing.note || null,
        description: "Paid (completed follow-up)"
      })
    );
  }
  return history;
}

export function historyAfterResolution(
  existing: PromiseToPayRecord,
  resolution: CollectionResolution,
  promiseDate: string,
  now: Date = new Date()
): CollectionActivityEvent[] {
  const type = eventTypeForResolution(resolution);
  let history = appendActivityEvent(
    existing.history,
    createActivityEvent({
      type,
      atUtc: now.toISOString(),
      promiseDate,
      note: resolution.note || resolution.reason || existing.note || null,
      description:
        type === "partially_paid" && resolution.paidAmount != null
          ? `Partially paid: ${resolution.paidAmount.toFixed(2)} (remaining ${resolution.remainingAmount ?? 0})`
          : undefined
    })
  );
  if (resolution.kind === "paid") {
    history = appendActivityEvent(
      history,
      createActivityEvent({
        type: "completed",
        atUtc: now.toISOString(),
        promiseDate,
        note: resolution.note || null
      })
    );
  }
  return history;
}

export function historyAfterContact(
  existing: PromiseToPayRecord | null,
  contact: {
    channel: ContactChannel;
    result: ContactResult;
    note: string;
    followUpAt: string | null;
  },
  now: Date = new Date()
): CollectionActivityEvent[] {
  return appendActivityEvent(
    existing?.history ?? [],
    createActivityEvent({
      type: "contact_logged",
      atUtc: now.toISOString(),
      note: contact.note || null,
      promiseDate: existing?.promiseDate ?? contact.followUpAt,
      contactChannel: contact.channel,
      contactResult: contact.result,
      followUpAt: contact.followUpAt
    })
  );
}

export function historyAfterDisputeChange(
  existing: PromiseToPayRecord | null,
  type: "dispute_raised" | "dispute_updated" | "dispute_resolved" | "dispute_rejected",
  dispute: {
    reason: DisputeReason;
    responsibleParty: DisputeParty;
    description: string;
    nextReviewAt: string | null;
    resolutionComment?: string | null;
  },
  now: Date = new Date()
): CollectionActivityEvent[] {
  const note =
    type === "dispute_resolved" || type === "dispute_rejected"
      ? dispute.resolutionComment?.trim() || dispute.description
      : dispute.description;
  return appendActivityEvent(
    existing?.history ?? [],
    createActivityEvent({
      type,
      atUtc: now.toISOString(),
      note: note || null,
      promiseDate: existing?.promiseDate ?? null,
      followUpAt: dispute.nextReviewAt,
      disputeReason: dispute.reason,
      disputeParty: dispute.responsibleParty
    })
  );
}

export function historyAfterEscalationChange(
  existing: PromiseToPayRecord | null,
  type: "case_escalated" | "escalation_updated" | "escalation_completed",
  escalation: {
    reason: EscalationReason;
    priority: EscalationPriority;
    responsibleTeam: EscalationTeam;
    requestedAction: string;
    dueDate: string;
    previousTeam?: EscalationTeam | null;
    completionComment?: string | null;
  },
  now: Date = new Date()
): CollectionActivityEvent[] {
  const handoff =
    type === "escalation_updated" &&
    escalation.previousTeam &&
    escalation.previousTeam !== escalation.responsibleTeam
      ? `${escalationTeamLabel(escalation.previousTeam)} → ${escalationTeamLabel(escalation.responsibleTeam)}`
      : null;
  const note =
    type === "escalation_completed"
      ? escalation.completionComment?.trim() || escalation.requestedAction
      : handoff
        ? `${handoff} — ${escalation.requestedAction}`
        : escalation.requestedAction;
  const description =
    type === "escalation_updated" && handoff
      ? `${activityEventTypeLabel(type)} · ${handoff} · ${escalationPriorityLabel(escalation.priority)} · ${escalationReasonLabel(escalation.reason)} · ${escalationTeamLabel(escalation.responsibleTeam)} — ${escalation.requestedAction.length > 80 ? `${escalation.requestedAction.slice(0, 77)}…` : escalation.requestedAction} (due ${escalation.dueDate})`
      : undefined;
  return appendActivityEvent(
    existing?.history ?? [],
    createActivityEvent({
      type,
      atUtc: now.toISOString(),
      note: note || null,
      promiseDate: existing?.promiseDate ?? null,
      followUpAt: type === "escalation_completed" ? null : escalation.dueDate,
      escalationReason: escalation.reason,
      escalationTeam: escalation.responsibleTeam,
      escalationPriority: escalation.priority,
      description
    })
  );
}

export function historyAfterPaymentPlanChange(
  existing: PromiseToPayRecord | null,
  type:
    | "payment_plan_created"
    | "payment_plan_updated"
    | "installment_payment_recorded"
    | "payment_plan_completed"
    | "payment_plan_cancelled",
  detail: {
    note?: string | null;
    promiseDate?: string | null;
    followUpAt?: string | null;
  },
  now: Date = new Date()
): CollectionActivityEvent[] {
  return appendActivityEvent(
    existing?.history ?? [],
    createActivityEvent({
      type,
      atUtc: now.toISOString(),
      note: detail.note?.trim() ? detail.note.trim() : null,
      promiseDate: detail.promiseDate ?? existing?.promiseDate ?? null,
      followUpAt: detail.followUpAt ?? null
    })
  );
}

export function historyAfterNoteChange(
  existing: PromiseToPayRecord | null,
  type: "note_added" | "note_updated" | "note_archived",
  detail: {
    note?: string | null;
    promiseDate?: string | null;
  },
  now: Date = new Date()
): CollectionActivityEvent[] {
  return appendActivityEvent(
    existing?.history ?? [],
    createActivityEvent({
      type,
      atUtc: now.toISOString(),
      note: detail.note?.trim() ? detail.note.trim() : null,
      promiseDate: detail.promiseDate ?? existing?.promiseDate ?? null,
      followUpAt: null
    })
  );
}
