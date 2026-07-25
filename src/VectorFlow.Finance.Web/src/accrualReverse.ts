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
