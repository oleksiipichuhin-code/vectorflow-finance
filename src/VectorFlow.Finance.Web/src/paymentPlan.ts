/**
 * Collection payment plan & installment tracking (browser-local).
 * Stored on PromiseToPayRecord — same localStorage key. Operational tracking only;
 * does not post ledger payments or change invoice status.
 */

import i18n from "./i18n/index.ts";
import { calendarDayDiff, localCalendarDateString } from "./invoiceDueDateAging.ts";

export type PaymentPlanStatus = "Active" | "Completed" | "Cancelled";

export type InstallmentComputedStatus =
  | "Scheduled"
  | "Partially paid"
  | "Paid"
  | "Overdue";

export type CollectionPaymentInstallment = {
  id: string;
  sequence: number;
  dueDate: string;
  expectedAmount: number;
  recordedPaidAmount: number;
  lastPaymentAtUtc: string | null;
};

export type CollectionPaymentPlan = {
  id: string;
  status: PaymentPlanStatus;
  currency: string;
  originalInvoiceAmount: number | null;
  planAmount: number;
  createdAtUtc: string;
  updatedAtUtc: string;
  completedAtUtc: string | null;
  cancelledAtUtc: string | null;
  cancellationReason: string | null;
  installments: CollectionPaymentInstallment[];
};

export type PaymentPlanInstallmentInput = {
  dueDate?: string;
  expectedAmount?: string | number;
  /** Stable id when editing an existing installment. */
  id?: string;
  recordedPaidAmount?: string | number;
};

export type PaymentPlanCreateInput = {
  planAmount?: string | number;
  currency?: string;
  originalInvoiceAmount?: string | number | null;
  installments?: readonly PaymentPlanInstallmentInput[];
  /**
   * Required when an open Promise to Pay commitment exists on the case.
   * Creating a plan replaces the simple promise date with the installment schedule.
   */
  replaceActivePromise?: boolean;
};

export type PaymentPlanUpdateInput = {
  planAmount?: string | number;
  installments?: readonly PaymentPlanInstallmentInput[];
};

export type InstallmentPaymentInput = {
  installmentId: string;
  amount?: string | number;
  note?: string;
};

export type PaymentPlanCancelInput = {
  reason?: string;
};

export type PaymentPlanValidationResult =
  | {
      ok: true;
      planAmount: number;
      currency: string;
      originalInvoiceAmount: number | null;
      installments: Array<{
        id: string | null;
        dueDate: string;
        expectedAmount: number;
        recordedPaidAmount: number;
      }>;
      replaceActivePromise: boolean;
    }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_STATUS_SET: ReadonlySet<string> = new Set([
  "Active",
  "Completed",
  "Cancelled"
]);

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseMoneyAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? roundMoney(value) : null;
  }
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? roundMoney(amount) : null;
}

export function isValidPlanDate(value: string | null | undefined): boolean {
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

export function paymentPlanStatusLabel(status: PaymentPlanStatus): string {
  return i18n.t(`promise.paymentPlanStatus.${status}`, { ns: "finance" });
}

const INSTALLMENT_STATUS_KEYS: Record<InstallmentComputedStatus, string> = {
  Scheduled: "scheduled",
  "Partially paid": "partial",
  Paid: "paid",
  Overdue: "overdue"
};

export function installmentStatusLabel(status: InstallmentComputedStatus): string {
  const suffix = INSTALLMENT_STATUS_KEYS[status];
  return suffix
    ? i18n.t(`promise.installmentStatus.${suffix}`, { ns: "finance" })
    : status;
}

export function isActivePaymentPlan(
  plan: CollectionPaymentPlan | null | undefined
): boolean {
  return plan?.status === "Active";
}

export function planPaidTotal(plan: CollectionPaymentPlan): number {
  return roundMoney(
    plan.installments.reduce((sum, item) => sum + item.recordedPaidAmount, 0)
  );
}

export function planRemainingTotal(plan: CollectionPaymentPlan): number {
  return roundMoney(Math.max(0, plan.planAmount - planPaidTotal(plan)));
}

export function planInstallmentRemaining(installment: CollectionPaymentInstallment): number {
  return roundMoney(Math.max(0, installment.expectedAmount - installment.recordedPaidAmount));
}

/**
 * Deterministic installment state from due date, paid amount, and today.
 * Paid wins; else past-due unpaid/partial → Overdue; else partial → Partially paid; else Scheduled.
 */
export function computeInstallmentStatus(
  installment: CollectionPaymentInstallment,
  now: Date = new Date()
): InstallmentComputedStatus {
  const paid = roundMoney(installment.recordedPaidAmount);
  const expected = roundMoney(installment.expectedAmount);
  if (paid >= expected && expected > 0) {
    return "Paid";
  }
  const today = localCalendarDateString(now);
  const relative = calendarDayDiff(today, installment.dueDate);
  if (relative != null && relative < 0 && paid < expected) {
    return "Overdue";
  }
  if (paid > 0) {
    return "Partially paid";
  }
  return "Scheduled";
}

export function countPaidInstallments(
  plan: CollectionPaymentPlan,
  now: Date = new Date()
): { paid: number; total: number } {
  const total = plan.installments.length;
  const paid = plan.installments.filter(
    (item) => computeInstallmentStatus(item, now) === "Paid"
  ).length;
  return { paid, total };
}

export function listOverdueInstallments(
  plan: CollectionPaymentPlan,
  now: Date = new Date()
): CollectionPaymentInstallment[] {
  if (!isActivePaymentPlan(plan)) {
    return [];
  }
  return plan.installments
    .filter((item) => computeInstallmentStatus(item, now) === "Overdue")
    .slice()
    .sort((a, b) =>
      a.dueDate !== b.dueDate
        ? a.dueDate < b.dueDate
          ? -1
          : 1
        : a.sequence - b.sequence
    );
}

/** Next unpaid installment (not Paid), earliest due date then sequence. */
export function selectNextInstallment(
  plan: CollectionPaymentPlan,
  now: Date = new Date()
): CollectionPaymentInstallment | null {
  if (!isActivePaymentPlan(plan)) {
    return null;
  }
  const unpaid = plan.installments
    .filter((item) => computeInstallmentStatus(item, now) !== "Paid")
    .slice()
    .sort((a, b) =>
      a.dueDate !== b.dueDate
        ? a.dueDate < b.dueDate
          ? -1
          : 1
        : a.sequence - b.sequence
    );
  return unpaid[0] ?? null;
}

export function hasOverdueInstallment(
  plan: CollectionPaymentPlan | null | undefined,
  now: Date = new Date()
): boolean {
  if (!isActivePaymentPlan(plan) || !plan) {
    return false;
  }
  return listOverdueInstallments(plan, now).length > 0;
}

export function planProgressRatio(plan: CollectionPaymentPlan): number {
  if (plan.planAmount <= 0) {
    return 0;
  }
  return Math.min(1, planPaidTotal(plan) / plan.planAmount);
}

export function sanitizeInstallment(raw: unknown): CollectionPaymentInstallment | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const sequence =
    typeof candidate.sequence === "number" && Number.isFinite(candidate.sequence)
      ? Math.trunc(candidate.sequence)
      : null;
  if (sequence == null || sequence < 1) {
    return null;
  }
  const dueRaw = typeof candidate.dueDate === "string" ? candidate.dueDate.trim() : "";
  if (!dueRaw || !isValidPlanDate(dueRaw)) {
    return null;
  }
  const expectedAmount =
    typeof candidate.expectedAmount === "number" && Number.isFinite(candidate.expectedAmount)
      ? roundMoney(candidate.expectedAmount)
      : null;
  if (expectedAmount == null || expectedAmount <= 0) {
    return null;
  }
  const recordedPaidAmount =
    typeof candidate.recordedPaidAmount === "number" &&
    Number.isFinite(candidate.recordedPaidAmount)
      ? roundMoney(Math.max(0, candidate.recordedPaidAmount))
      : 0;
  const lastPaymentAtUtc =
    typeof candidate.lastPaymentAtUtc === "string" && candidate.lastPaymentAtUtc.trim()
      ? candidate.lastPaymentAtUtc.trim()
      : null;
  return {
    id,
    sequence,
    dueDate: dueRaw,
    expectedAmount,
    recordedPaidAmount,
    lastPaymentAtUtc
  };
}

export function sanitizePaymentPlan(raw: unknown): CollectionPaymentPlan | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  if (!id) {
    return null;
  }
  const statusRaw = typeof candidate.status === "string" ? candidate.status.trim() : "";
  if (!PLAN_STATUS_SET.has(statusRaw)) {
    return null;
  }
  const currency =
    typeof candidate.currency === "string" && candidate.currency.trim()
      ? candidate.currency.trim()
      : "";
  if (!currency) {
    return null;
  }
  const planAmount =
    typeof candidate.planAmount === "number" && Number.isFinite(candidate.planAmount)
      ? roundMoney(candidate.planAmount)
      : null;
  if (planAmount == null || planAmount <= 0) {
    return null;
  }
  const originalInvoiceAmount =
    typeof candidate.originalInvoiceAmount === "number" &&
    Number.isFinite(candidate.originalInvoiceAmount)
      ? roundMoney(candidate.originalInvoiceAmount)
      : null;
  const createdAtUtc =
    typeof candidate.createdAtUtc === "string" && candidate.createdAtUtc.trim()
      ? candidate.createdAtUtc.trim()
      : new Date(0).toISOString();
  const updatedAtUtc =
    typeof candidate.updatedAtUtc === "string" && candidate.updatedAtUtc.trim()
      ? candidate.updatedAtUtc.trim()
      : createdAtUtc;
  const completedAtUtc =
    typeof candidate.completedAtUtc === "string" && candidate.completedAtUtc.trim()
      ? candidate.completedAtUtc.trim()
      : null;
  const cancelledAtUtc =
    typeof candidate.cancelledAtUtc === "string" && candidate.cancelledAtUtc.trim()
      ? candidate.cancelledAtUtc.trim()
      : null;
  const cancellationReason =
    typeof candidate.cancellationReason === "string" && candidate.cancellationReason.trim()
      ? candidate.cancellationReason.trim()
      : null;

  if (!Array.isArray(candidate.installments) || candidate.installments.length === 0) {
    return null;
  }
  const installments: CollectionPaymentInstallment[] = [];
  for (const item of candidate.installments) {
    const installment = sanitizeInstallment(item);
    if (!installment) {
      return null;
    }
    installments.push(installment);
  }
  installments.sort((a, b) => a.sequence - b.sequence);

  return {
    id,
    status: statusRaw as PaymentPlanStatus,
    currency,
    originalInvoiceAmount,
    planAmount,
    createdAtUtc,
    updatedAtUtc,
    completedAtUtc,
    cancelledAtUtc,
    cancellationReason,
    installments
  };
}

function createPlanId(invoiceId: string, now: Date): string {
  return `payment-plan|${invoiceId.trim().toLowerCase()}|${now.toISOString()}`;
}

function createInstallmentId(planId: string, sequence: number, dueDate: string): string {
  return `installment|${planId}|${sequence}|${dueDate}`;
}

/**
 * Validate create (or full schedule) input. Sum of installments must equal plan amount;
 * due dates must be non-decreasing.
 */
export function validatePaymentPlanCreateInput(
  input: PaymentPlanCreateInput
): PaymentPlanValidationResult {
  const planAmount = parseMoneyAmount(input.planAmount);
  const currency = (input.currency ?? "").trim();
  const rows = input.installments ?? [];

  if (planAmount == null && rows.length === 0 && !currency) {
    return { ok: false, error: i18n.t("plan.error.fieldsRequired", { ns: "finance" }) };
  }
  if (planAmount == null || planAmount <= 0) {
    return { ok: false, error: i18n.t("plan.error.amountRequired", { ns: "finance" }) };
  }
  if (!currency) {
    return { ok: false, error: i18n.t("plan.error.currencyRequired", { ns: "finance" }) };
  }
  if (rows.length === 0) {
    return { ok: false, error: i18n.t("plan.error.installmentRequired", { ns: "finance" }) };
  }

  const installments: Array<{
    id: string | null;
    dueDate: string;
    expectedAmount: number;
    recordedPaidAmount: number;
  }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const dueRaw = (row.dueDate ?? "").trim();
    const expectedAmount = parseMoneyAmount(row.expectedAmount);
    const recordedPaidAmount = parseMoneyAmount(row.recordedPaidAmount) ?? 0;

    if (!dueRaw && expectedAmount == null) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentFieldsRequired", {
          ns: "finance",
          index: index + 1
        })
      };
    }
    if (!dueRaw || !isValidPlanDate(dueRaw)) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentDueDateFormat", {
          ns: "finance",
          index: index + 1
        })
      };
    }
    if (expectedAmount == null || expectedAmount <= 0) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentAmountPositive", {
          ns: "finance",
          index: index + 1
        })
      };
    }
    if (recordedPaidAmount < 0) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentPaidNegative", {
          ns: "finance",
          index: index + 1
        })
      };
    }
    if (recordedPaidAmount > expectedAmount) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentPaidExceedsExpected", {
          ns: "finance",
          index: index + 1
        })
      };
    }
    installments.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : null,
      dueDate: dueRaw,
      expectedAmount,
      recordedPaidAmount
    });
  }

  for (let index = 1; index < installments.length; index += 1) {
    if (installments[index]!.dueDate < installments[index - 1]!.dueDate) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentOrder", { ns: "finance" })
      };
    }
  }

  const sum = roundMoney(
    installments.reduce((acc, item) => acc + item.expectedAmount, 0)
  );
  if (sum !== planAmount) {
    return {
      ok: false,
      error: i18n.t("plan.error.installmentSumMismatch", {
        ns: "finance",
        sum: sum.toFixed(2),
        planAmount: planAmount.toFixed(2)
      })
    };
  }

  const originalInvoiceAmount =
    input.originalInvoiceAmount === undefined || input.originalInvoiceAmount === null
      ? null
      : parseMoneyAmount(input.originalInvoiceAmount);

  return {
    ok: true,
    planAmount,
    currency,
    originalInvoiceAmount,
    installments,
    replaceActivePromise: input.replaceActivePromise === true
  };
}

export function validatePaymentPlanUpdateInput(
  input: PaymentPlanUpdateInput,
  existing: CollectionPaymentPlan
): PaymentPlanValidationResult {
  const base = validatePaymentPlanCreateInput({
    planAmount: input.planAmount ?? existing.planAmount,
    currency: existing.currency,
    originalInvoiceAmount: existing.originalInvoiceAmount,
    installments: input.installments,
    replaceActivePromise: true
  });
  if (!base.ok) {
    return base;
  }

  const byId = new Map(existing.installments.map((item) => [item.id, item]));
  for (const row of base.installments) {
    if (!row.id) {
      continue;
    }
    const previous = byId.get(row.id);
    if (!previous) {
      continue;
    }
    if (previous.recordedPaidAmount > 0) {
      if (
        previous.dueDate !== row.dueDate ||
        previous.expectedAmount !== row.expectedAmount ||
        roundMoney(previous.recordedPaidAmount) !== roundMoney(row.recordedPaidAmount)
      ) {
        return {
          ok: false,
          error: i18n.t("plan.error.installmentPaidImmutable", {
            ns: "finance",
            sequence: previous.sequence
          })
        };
      }
    }
    if (roundMoney(row.recordedPaidAmount) < roundMoney(previous.recordedPaidAmount)) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentPaidDecrease", {
          ns: "finance",
          sequence: previous.sequence
        })
      };
    }
  }

  for (const previous of existing.installments) {
    if (previous.recordedPaidAmount <= 0) {
      continue;
    }
    const stillPresent = base.installments.some((row) => row.id === previous.id);
    if (!stillPresent) {
      return {
        ok: false,
        error: i18n.t("plan.error.installmentPaidDelete", {
          ns: "finance",
          sequence: previous.sequence
        })
      };
    }
  }

  return base;
}

export function validateInstallmentPaymentInput(
  input: InstallmentPaymentInput,
  plan: CollectionPaymentPlan,
  now: Date = new Date()
):
  | {
      ok: true;
      installment: CollectionPaymentInstallment;
      amount: number;
      note: string;
      nextPaid: number;
      remainingAfter: number;
    }
  | { ok: false; error: string } {
  if (!isActivePaymentPlan(plan)) {
    return { ok: false, error: i18n.t("plan.error.activePlanRequired", { ns: "finance" }) };
  }
  const installmentId = (input.installmentId ?? "").trim();
  if (!installmentId) {
    return { ok: false, error: i18n.t("plan.error.installmentSelectionRequired", { ns: "finance" }) };
  }
  const installment = plan.installments.find((item) => item.id === installmentId);
  if (!installment) {
    return { ok: false, error: i18n.t("plan.error.installmentNotFound", { ns: "finance" }) };
  }
  if (computeInstallmentStatus(installment, now) === "Paid") {
    return { ok: false, error: i18n.t("plan.error.installmentAlreadyPaid", { ns: "finance" }) };
  }
  const amount = parseMoneyAmount(input.amount);
  if (amount == null || amount <= 0) {
    return { ok: false, error: i18n.t("plan.error.paymentAmountRequired", { ns: "finance" }) };
  }
  const remaining = planInstallmentRemaining(installment);
  if (amount > remaining) {
    return {
      ok: false,
      error: i18n.t("plan.error.paymentExceedsRemaining", {
        ns: "finance",
        remaining: remaining.toFixed(2)
      })
    };
  }
  const nextPaid = roundMoney(installment.recordedPaidAmount + amount);
  return {
    ok: true,
    installment,
    amount,
    note: (input.note ?? "").trim(),
    nextPaid,
    remainingAfter: roundMoney(Math.max(0, installment.expectedAmount - nextPaid))
  };
}

export function validatePaymentPlanCancelInput(
  input: PaymentPlanCancelInput
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = (input.reason ?? "").trim();
  if (!reason) {
    return { ok: false, error: i18n.t("plan.error.cancellationReasonRequired", { ns: "finance" }) };
  }
  return { ok: true, reason };
}

export function buildInstallmentsFromValidated(
  planId: string,
  validated: Extract<PaymentPlanValidationResult, { ok: true }>,
  existing: CollectionPaymentPlan | null
): CollectionPaymentInstallment[] {
  const existingById = new Map(
    (existing?.installments ?? []).map((item) => [item.id, item])
  );
  return validated.installments.map((row, index) => {
    const sequence = index + 1;
    const previous = row.id ? existingById.get(row.id) : undefined;
    const id =
      previous?.id ??
      row.id ??
      createInstallmentId(planId, sequence, row.dueDate);
    return {
      id,
      sequence,
      dueDate: row.dueDate,
      expectedAmount: row.expectedAmount,
      recordedPaidAmount: previous
        ? previous.recordedPaidAmount
        : row.recordedPaidAmount,
      lastPaymentAtUtc: previous?.lastPaymentAtUtc ?? null
    };
  });
}

export function createPaymentPlanEntity(
  invoiceId: string,
  validated: Extract<PaymentPlanValidationResult, { ok: true }>,
  now: Date
): CollectionPaymentPlan {
  const at = now.toISOString();
  const id = createPlanId(invoiceId, now);
  return {
    id,
    status: "Active",
    currency: validated.currency,
    originalInvoiceAmount: validated.originalInvoiceAmount,
    planAmount: validated.planAmount,
    createdAtUtc: at,
    updatedAtUtc: at,
    completedAtUtc: null,
    cancelledAtUtc: null,
    cancellationReason: null,
    installments: buildInstallmentsFromValidated(id, validated, null)
  };
}

export function applyPlanCompletionIfNeeded(
  plan: CollectionPaymentPlan,
  now: Date
): { plan: CollectionPaymentPlan; justCompleted: boolean } {
  if (plan.status !== "Active") {
    return { plan, justCompleted: false };
  }
  const paid = planPaidTotal(plan);
  if (paid < plan.planAmount) {
    return { plan, justCompleted: false };
  }
  if (plan.completedAtUtc) {
    return {
      plan: { ...plan, status: "Completed" },
      justCompleted: false
    };
  }
  const at = now.toISOString();
  return {
    plan: {
      ...plan,
      status: "Completed",
      completedAtUtc: at,
      updatedAtUtc: at
    },
    justCompleted: true
  };
}

export function summarizePlanUpdate(
  previous: CollectionPaymentPlan,
  next: CollectionPaymentPlan
): string {
  const parts: string[] = [];
  if (previous.planAmount !== next.planAmount) {
    parts.push(
      `plan ${previous.planAmount.toFixed(2)} → ${next.planAmount.toFixed(2)} ${next.currency}`
    );
  }
  if (previous.installments.length !== next.installments.length) {
    parts.push(
      `installments ${previous.installments.length} → ${next.installments.length}`
    );
  }
  const prevById = new Map(previous.installments.map((item) => [item.id, item]));
  for (const item of next.installments) {
    const before = prevById.get(item.id);
    if (!before) {
      parts.push(`#${item.sequence} added ${item.dueDate} ${item.expectedAmount.toFixed(2)}`);
      continue;
    }
    if (before.dueDate !== item.dueDate || before.expectedAmount !== item.expectedAmount) {
      parts.push(
        `#${item.sequence} ${before.dueDate}/${before.expectedAmount.toFixed(2)} → ${item.dueDate}/${item.expectedAmount.toFixed(2)}`
      );
    }
  }
  for (const before of previous.installments) {
    if (!next.installments.some((item) => item.id === before.id)) {
      parts.push(`#${before.sequence} removed`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : "schedule unchanged";
}

/** Empty draft row helpers for UI forms. */
export function emptyInstallmentDraft(): PaymentPlanInstallmentInput {
  return { dueDate: "", expectedAmount: "" };
}
