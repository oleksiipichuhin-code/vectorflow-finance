export const SUPPORTED_LOCALES = ["uk", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "uk";

/** Canonical Finance product locale storage key. */
export const LOCALE_STORAGE_KEY = "vectorflow-finance.locale";

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "uk" || value === "en";
}

/** Map BCP-47 / browser tags onto supported product locales. */
export function normalizeBrowserLocale(tag: string | null | undefined): AppLocale | null {
  if (!tag || typeof tag !== "string") {
    return null;
  }

  const normalized = tag.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) {
    return null;
  }

  const primary = normalized.split("-")[0] ?? "";
  if (primary === "uk" || primary === "ua") {
    return "uk";
  }

  if (primary === "en") {
    return "en";
  }

  return null;
}

export function resolveInitialLocale(options?: {
  stored?: string | null;
  browserLanguages?: readonly string[];
}): AppLocale {
  const stored = options?.stored;
  if (isAppLocale(stored)) {
    return stored;
  }

  const browserLanguages = options?.browserLanguages ?? [];
  for (const tag of browserLanguages) {
    const matched = normalizeBrowserLocale(tag);
    if (matched) {
      return matched;
    }
  }

  return DEFAULT_LOCALE;
}

/** Intl locale tag for presentation (language only — not currency). */
export function toIntlLocale(locale: AppLocale): string {
  return locale === "uk" ? "uk-UA" : "en-GB";
}
