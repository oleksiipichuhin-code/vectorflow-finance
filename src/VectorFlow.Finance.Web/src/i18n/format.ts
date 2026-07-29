import i18n, { getActiveLocale } from "./index.ts";
import { toIntlLocale, type AppLocale } from "./locales.ts";

const BUSINESS_TIME_ZONE = "Europe/Kyiv";

function parseInstant(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: string | null | undefined,
  options?: { locale?: AppLocale }
): string {
  if (!value) {
    return i18n.t("emDash", { ns: "common" });
  }

  const date = parseInstant(value);
  if (!date) {
    return value;
  }

  const locale = options?.locale ?? getActiveLocale(i18n);
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatNumber(
  value: number,
  options?: {
    locale?: AppLocale;
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  }
): string {
  const locale = options?.locale ?? getActiveLocale(i18n);
  return new Intl.NumberFormat(toIntlLocale(locale), {
    maximumFractionDigits: options?.maximumFractionDigits ?? 0,
    minimumFractionDigits: options?.minimumFractionDigits ?? 0
  }).format(value);
}

/**
 * Currency presentation uses the currency code from domain/API data.
 * Language never determines the currency.
 */
export function formatMoney(
  amount: number,
  currency: string,
  options?: { locale?: AppLocale }
): string {
  const locale = options?.locale ?? getActiveLocale(i18n);
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "code"
  }).format(amount);
}
