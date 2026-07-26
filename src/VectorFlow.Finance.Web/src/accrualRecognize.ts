import type { Accrual } from "./api";

export function isDraftAccrual(accrual: Pick<Accrual, "status">): boolean {
  return accrual.status === "Draft";
}

export function canRecognizeAccrual(accrual: Pick<Accrual, "status">): boolean {
  return isDraftAccrual(accrual);
}

export type AccrualRecognizeFailure = {
  message: string;
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
  "Нарахування було змінено іншою дією. Список оновлено — повторіть визнання з актуальними даними.";

const NOT_FOUND_OPERATOR_MESSAGE =
  "Нарахування не знайдено. Список оновлено з сервера.";

/**
 * Map Finance API / network failures for recognize.
 * Conflict and NotFound refresh the list; validation does not auto-refresh.
 */
export function interpretAccrualRecognizeError(error: unknown): AccrualRecognizeFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: CONFLICT_OPERATOR_MESSAGE,
        refreshList: true
      };
    }

    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        message: NOT_FOUND_OPERATOR_MESSAGE,
        refreshList: true
      };
    }

    if (apiFailure.status === 400 || apiFailure.errorKind === "ValidationFailed") {
      return {
        message: apiFailure.message,
        refreshList: false
      };
    }

    return {
      message: apiFailure.message,
      refreshList: false
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      refreshList: false
    };
  }

  return {
    message: "Не вдалося визнати нарахування.",
    refreshList: false
  };
}
