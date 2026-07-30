import type { Accrual } from "./api";
import i18n from "./i18n/index.ts";

/** Mirrors Domain Accrual.DescriptionMaxLength. */
export const ACCRUAL_DESCRIPTION_MAX_LENGTH = 500;

export const ACCRUAL_TYPE_OPTIONS = ["Revenue", "Expense"] as const;

export type AccrualTypeOption = (typeof ACCRUAL_TYPE_OPTIONS)[number];

export type DraftAccrualEditorField =
  | "description"
  | "recognitionDate"
  | "type"
  | "currency";

/** Stable mutation order for multi-field saves (sequential, never parallel). */
export const DRAFT_ACCRUAL_EDITOR_FIELD_ORDER: readonly DraftAccrualEditorField[] = [
  "description",
  "recognitionDate",
  "type",
  "currency"
] as const;

export type DraftAccrualEditorValues = {
  description: string;
  /** `YYYY-MM-DD` date input value. */
  recognitionDate: string;
  type: string;
  currency: string;
};

export function canEditDraftAccrualDetails(
  accrual: Pick<Accrual, "status">
): boolean {
  return accrual.status === "Draft";
}

/** Prefill date input from server recognitionDateUtc ISO. */
export function formatRecognitionDateInput(recognitionDateUtc: string): string {
  const trimmed = recognitionDateUtc.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

/** Converts a `YYYY-MM-DD` date input to absolute UTC midnight ISO. */
export function toRecognitionDateUtcIso(dateInput: string): string {
  const trimmed = dateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(i18n.t("accruals.error.recognitionDateFormat", { ns: "finance" }));
  }

  return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
}

export function valuesFromAccrual(accrual: Accrual): DraftAccrualEditorValues {
  return {
    description: accrual.description,
    recognitionDate: formatRecognitionDateInput(accrual.recognitionDateUtc),
    type: accrual.type,
    currency: accrual.currency
  };
}

export function normalizeDraftDescription(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(i18n.t("accruals.error.descriptionRequired", { ns: "finance" }));
  }

  const normalized = raw.trim();
  if (normalized.length > ACCRUAL_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      i18n.t("accruals.error.descriptionTooLong", {
        ns: "finance",
        max: ACCRUAL_DESCRIPTION_MAX_LENGTH
      })
    );
  }

  return normalized;
}

export function normalizeDraftCurrency(raw: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(i18n.t("accruals.error.currencyRequired", { ns: "finance" }));
  }

  return raw.trim().toUpperCase();
}

export function normalizeDraftType(raw: string): AccrualTypeOption {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "Revenue" || trimmed === "Expense") {
    return trimmed;
  }

  throw new Error(i18n.t("accruals.error.typeInvalid", { ns: "finance" }));
}

/**
 * Client-side validation before any mutation.
 * Server remains authoritative for edge cases.
 */
export function validateDraftAccrualEditorValues(
  draft: DraftAccrualEditorValues
): string | null {
  try {
    normalizeDraftDescription(draft.description);
    toRecognitionDateUtcIso(draft.recognitionDate);
    normalizeDraftType(draft.type);
    normalizeDraftCurrency(draft.currency);
  } catch (error) {
    return error instanceof Error
      ? error.message
      : i18n.t("accruals.error.checkEditorFields", { ns: "finance" });
  }

  return null;
}

function normalizedComparable(
  values: DraftAccrualEditorValues
): DraftAccrualEditorValues {
  return {
    description: values.description.trim(),
    recognitionDate: values.recognitionDate.trim(),
    type: values.type.trim(),
    currency: values.currency.trim().toUpperCase()
  };
}

/**
 * Returns only fields that differ from baseline, in DRAFT_ACCRUAL_EDITOR_FIELD_ORDER.
 * Unchanged fields are omitted — callers must not POST for them.
 */
export function detectDraftAccrualEditorChanges(
  baseline: DraftAccrualEditorValues,
  draft: DraftAccrualEditorValues
): DraftAccrualEditorField[] {
  const left = normalizedComparable(baseline);
  const right = normalizedComparable(draft);
  const changed: DraftAccrualEditorField[] = [];

  for (const field of DRAFT_ACCRUAL_EDITOR_FIELD_ORDER) {
    if (left[field] !== right[field]) {
      changed.push(field);
    }
  }

  return changed;
}

export type DraftAccrualEditorMutations = {
  changeDescription: (
    workspaceId: string,
    accrualId: string,
    description: string
  ) => Promise<Accrual>;
  changeRecognitionDate: (
    workspaceId: string,
    accrualId: string,
    recognitionDateUtc: string
  ) => Promise<Accrual>;
  changeType: (
    workspaceId: string,
    accrualId: string,
    type: string
  ) => Promise<Accrual>;
  changeCurrency: (
    workspaceId: string,
    accrualId: string,
    currency: string
  ) => Promise<Accrual>;
};

/**
 * Applies only changed fields via existing atomic POSTs, sequentially.
 * Stops on the first failure; does not roll back prior successes.
 * Returns null when nothing changed (no requests).
 */
export async function applyDraftAccrualEditorChanges(
  workspaceId: string,
  accrualId: string,
  baseline: DraftAccrualEditorValues,
  draft: DraftAccrualEditorValues,
  mutations: DraftAccrualEditorMutations
): Promise<Accrual | null> {
  const validationError = validateDraftAccrualEditorValues(draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const changed = detectDraftAccrualEditorChanges(baseline, draft);
  if (changed.length === 0) {
    return null;
  }

  let last: Accrual | null = null;

  for (const field of changed) {
    switch (field) {
      case "description":
        last = await mutations.changeDescription(
          workspaceId,
          accrualId,
          normalizeDraftDescription(draft.description)
        );
        break;
      case "recognitionDate":
        last = await mutations.changeRecognitionDate(
          workspaceId,
          accrualId,
          toRecognitionDateUtcIso(draft.recognitionDate)
        );
        break;
      case "type":
        last = await mutations.changeType(
          workspaceId,
          accrualId,
          normalizeDraftType(draft.type)
        );
        break;
      case "currency":
        last = await mutations.changeCurrency(
          workspaceId,
          accrualId,
          normalizeDraftCurrency(draft.currency)
        );
        break;
      default: {
        const _exhaustive: never = field;
        throw new Error(`Unsupported draft editor field: ${String(_exhaustive)}`);
      }
    }
  }

  return last;
}

export type DraftAccrualEditorFailure = {
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

function conflictOperatorMessage(): string {
  return i18n.t("accruals.error.editorConflict", { ns: "finance" });
}

function notFoundOperatorMessage(): string {
  return i18n.t("accruals.error.notFoundRefreshed", { ns: "finance" });
}

/**
 * Map Finance API / network failures for draft details editor.
 * Conflict and NotFound close the editor and require a list refresh.
 * Validation and network stay in the editor; no auto-retry.
 */
export function interpretDraftAccrualEditorError(
  error: unknown
): DraftAccrualEditorFailure {
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
    message: i18n.t("accruals.error.detailsEditFailed", { ns: "finance" }),
    keepEditorOpen: true,
    refreshList: false
  };
}
