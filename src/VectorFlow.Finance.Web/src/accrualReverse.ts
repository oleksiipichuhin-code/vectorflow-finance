import type { Accrual } from "./api";

/** Mirrors Domain Accrual.ReversalReasonMaxLength. */
export const REVERSAL_REASON_MAX_LENGTH = 500;

export function isRecognizedAccrual(accrual: Pick<Accrual, "status">): boolean {
  return accrual.status === "Recognized";
}

export function canReverseAccrual(accrual: Pick<Accrual, "status">): boolean {
  return isRecognizedAccrual(accrual);
}

/**
 * Frontend early check aligned with backend NormalizeReversalReason:
 * trim; reject blank/whitespace; enforce max length.
 */
export function normalizeReversalReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) {
    throw new Error("Вкажіть причину сторнування.");
  }

  if (normalized.length > REVERSAL_REASON_MAX_LENGTH) {
    throw new Error(
      `Причина сторнування не може перевищувати ${REVERSAL_REASON_MAX_LENGTH} символів.`
    );
  }

  return normalized;
}

export type AccrualReverseFailure = {
  message: string;
  keepEditorOpen: boolean;
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
  "Нарахування було змінено іншою дією. Список оновлено — відкрийте сторнування знову з актуальними даними.";

const NOT_FOUND_OPERATOR_MESSAGE =
  "Нарахування не знайдено. Список оновлено з сервера.";

/**
 * Map Finance API / network failures for reverse.
 * Conflict and NotFound close the reverse form and require a list refresh.
 * Validation stays in the form; server remains authoritative for edge cases.
 */
export function interpretAccrualReverseError(error: unknown): AccrualReverseFailure {
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
    message: "Не вдалося сторнувати нарахування.",
    keepEditorOpen: true,
    refreshList: false
  };
}
