/** Presentation labels for trial-balance / account-balance side wire values. */
export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

/**
 * Localize API balance-side wire values (`Debit` | `Credit` | `Zero`) at the
 * presentation layer only. Unknown sides pass through; empty falls back to em dash.
 */
export function formatBalanceSide(
  side: string | null | undefined,
  t: TranslateFn
): string {
  if (side === "Debit" || side === "Credit" || side === "Zero") {
    return t(`balanceSide.${side}`, { ns: "finance" });
  }
  return side?.trim() || t("emDash", { ns: "common" });
}

/** Localized balanced / unbalanced banner title for the trial-balance header. */
export function trialBalanceBalanceLabel(
  isBalanced: boolean,
  t: TranslateFn
): string {
  return isBalanced
    ? t("trialBalance.balanced", { ns: "finance" })
    : t("trialBalance.unbalanced", { ns: "finance" });
}
