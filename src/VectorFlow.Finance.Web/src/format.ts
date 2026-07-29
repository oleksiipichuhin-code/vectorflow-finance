/**
 * Shared formatting helpers for Finance views that are not yet migrated to i18n.
 * Migrated workflows should prefer `./i18n/format.ts` for locale-aware presentation.
 */
export function formatMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("uk-UA");
}
