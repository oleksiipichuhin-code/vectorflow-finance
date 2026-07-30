import type { Accrual } from "./api";
import i18n from "./i18n/index.ts";

export function canEditAccrualAmount(accrual: Pick<Accrual, "status">): boolean {
  return accrual.status === "Draft";
}

/** Prefill editor from server major-unit amount (display-aligned 2 dp). */
export function formatAccrualAmountInput(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "";
  }

  return amount.toFixed(2);
}

/**
 * Parse operator amount input to a JSON-wire major-unit number.
 * Comma decimal separator is accepted; no float multiply/divide transforms.
 */
export function parseAccrualAmountInput(raw: string): number {
  const numericMessage = () => i18n.t("accruals.error.amountNumeric", { ns: "finance" });

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(numericMessage());
  }

  const normalized = trimmed.replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$|^\.\d+$/.test(normalized)) {
    throw new Error(numericMessage());
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error(numericMessage());
  }

  if (amount <= 0) {
    throw new Error(i18n.t("accruals.error.amountPositive", { ns: "finance" }));
  }

  return amount;
}

export type AccrualAmountEditFailure = {
  message: string;
  /** Keep inline editor open for correction. */
  keepEditorOpen: boolean;
  /** Reload list from server with current applied filters. */
  refreshList: boolean;
};

type ApiFailureShape = {
  status: number;
  errorKind: string | null;
  message: string;
};

function asApiFailure(error: unknown): ApiFailureShape | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const candidate = error as Error & {
    status?: unknown;
    errorKind?: unknown;
  };

  if (typeof candidate.status !== "number") {
    return null;
  }

  return {
    status: candidate.status,
    errorKind: typeof candidate.errorKind === "string" ? candidate.errorKind : null,
    message: candidate.message
  };
}

function conflictOperatorMessage(): string {
  return i18n.t("accruals.error.editorConflict", { ns: "finance" });
}

function notFoundOperatorMessage(): string {
  return i18n.t("accruals.error.notFoundRefreshed", { ns: "finance" });
}

/**
 * Map Finance API / network failures for draft amount edit.
 * Conflict and NotFound close the editor and require a list refresh.
 * Validation stays in the editor; server remains authoritative for edge cases.
 */
export function interpretAccrualAmountEditError(error: unknown): AccrualAmountEditFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: conflictOperatorMessage(),
        keepEditorOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        message: notFoundOperatorMessage(),
        keepEditorOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 400 || apiFailure.errorKind === "ValidationFailed") {
      return {
        message: apiFailure.message,
        keepEditorOpen: true,
        refreshList: false
      };
    }

    return {
      message: apiFailure.message,
      keepEditorOpen: true,
      refreshList: false
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      keepEditorOpen: true,
      refreshList: false
    };
  }

  return {
    message: i18n.t("accruals.error.amountEditFailed", { ns: "finance" }),
    keepEditorOpen: true,
    refreshList: false
  };
}
