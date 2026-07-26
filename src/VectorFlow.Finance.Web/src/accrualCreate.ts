/**
 * Create Accrual helpers for optional Source Invoice selection.
 * Create uses a single POST; no post-create change-source-invoice.
 */

export type CreateAccrualFailure = {
  message: string;
  keepFormOpen: boolean;
  /** Clear only the stale Source Invoice selection after confirmed Invoice NotFound. */
  clearSourceInvoiceSelection: boolean;
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

const INVOICE_NOT_FOUND_MESSAGE =
  "Вибраний рахунок більше недоступний у цьому workspace. Очистіть вибір або виберіть інший рахунок.";

const WORKSPACE_NOT_FOUND_MESSAGE =
  "Фінансовий простір не знайдено. Перезавантажте сторінку та спробуйте знову.";

const CONFLICT_MESSAGE =
  "Не вдалося створити нарахування через конфлікт даних. Перевірте введені значення та спробуйте знову.";

/**
 * Map Finance API / network failures for Create Accrual.
 * Keeps the form open; never auto-retries; never treats errors as success.
 */
export function interpretCreateAccrualError(error: unknown): CreateAccrualFailure {
  const apiFailure = asApiFailure(error);
  if (apiFailure) {
    if (apiFailure.status === 404 || apiFailure.errorKind === "NotFound") {
      const invoiceMissing = /invoice/i.test(apiFailure.message);
      const workspaceMissing = /workspace/i.test(apiFailure.message);
      return {
        message: invoiceMissing
          ? INVOICE_NOT_FOUND_MESSAGE
          : workspaceMissing
            ? WORKSPACE_NOT_FOUND_MESSAGE
            : apiFailure.message,
        keepFormOpen: true,
        clearSourceInvoiceSelection: invoiceMissing
      };
    }

    if (apiFailure.status === 409 || apiFailure.errorKind === "Conflict") {
      return {
        message: CONFLICT_MESSAGE,
        keepFormOpen: true,
        clearSourceInvoiceSelection: false
      };
    }

    if (apiFailure.status === 400 || apiFailure.errorKind === "ValidationFailed") {
      return {
        message: apiFailure.message,
        keepFormOpen: true,
        clearSourceInvoiceSelection: false
      };
    }

    return {
      message: apiFailure.message,
      keepFormOpen: true,
      clearSourceInvoiceSelection: false
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      keepFormOpen: true,
      clearSourceInvoiceSelection: false
    };
  }

  return {
    message: "Не вдалося створити нарахування.",
    keepFormOpen: true,
    clearSourceInvoiceSelection: false
  };
}
