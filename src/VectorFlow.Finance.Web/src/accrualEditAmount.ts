import type { Accrual } from "./api";

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
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Сума має бути числовим значенням.");
  }

  const normalized = trimmed.replace(",", ".");
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$|^\.\d+$/.test(normalized)) {
    throw new Error("Сума має бути числовим значенням.");
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error("Сума має бути числовим значенням.");
  }

  if (amount <= 0) {
    throw new Error("Сума має бути більшою за нуль.");
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

const CONFLICT_OPERATOR_MESSAGE =
  "Нарахування було змінено іншою дією. Список оновлено — відкрийте редагування знову з актуальними даними.";

const NOT_FOUND_OPERATOR_MESSAGE =
  "Нарахування не знайдено. Список оновлено з сервера.";

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
        message: CONFLICT_OPERATOR_MESSAGE,
        keepEditorOpen: false,
        refreshList: true
      };
    }

    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        message: NOT_FOUND_OPERATOR_MESSAGE,
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
    message: "Не вдалося змінити суму нарахування.",
    keepEditorOpen: true,
    refreshList: false
  };
}
