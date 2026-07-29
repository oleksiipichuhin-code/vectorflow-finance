/** Labels for trial-balance line balance side from the Finance API. */
export function formatBalanceSide(side: string | null | undefined): string {
  switch (side) {
    case "Debit":
      return "Debit";
    case "Credit":
      return "Credit";
    case "Zero":
      return "Zero";
    default:
      return side?.trim() || "—";
  }
}

/** Ukrainian status copy for the trial-balance header banner. */
export function trialBalanceBalanceLabel(isBalanced: boolean): string {
  return isBalanced ? "Збалансовано" : "Не збалансовано";
}
