import type { Accrual } from "./api";
import i18n from "./i18n/index.ts";

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

function conflictOperatorMessage(): string {
  return i18n.t("accruals.error.recognizeConflict", { ns: "finance" });
}

function notFoundOperatorMessage(): string {
  return i18n.t("accruals.error.notFoundRefreshed", { ns: "finance" });
}

/**
 * Map Finance API / network failures for recognize.
 * Conflict and NotFound refresh the list; validation does not auto-refresh.
 */
export function interpretAccrualRecognizeError(error: unknown): AccrualRecognizeFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: conflictOperatorMessage(),
        refreshList: true
      };
    }

    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      return {
        message: notFoundOperatorMessage(),
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
    message: i18n.t("accruals.error.recognizeFailed", { ns: "finance" }),
    refreshList: false
  };
}
