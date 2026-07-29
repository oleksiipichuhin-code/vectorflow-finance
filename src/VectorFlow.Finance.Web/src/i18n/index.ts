import i18n, { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import commonEn from "./locales/en/common.json" with { type: "json" };
import financeEn from "./locales/en/finance.json" with { type: "json" };
import commonUk from "./locales/uk/common.json" with { type: "json" };
import financeUk from "./locales/uk/finance.json" with { type: "json" };
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isAppLocale,
  resolveInitialLocale,
  type AppLocale
} from "./locales.ts";

export type { AppLocale } from "./locales.ts";
export {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  isAppLocale,
  normalizeBrowserLocale,
  resolveInitialLocale,
  toIntlLocale
} from "./locales.ts";

export const i18nNamespaces = ["common", "finance"] as const;

const resources = {
  uk: {
    common: commonUk,
    finance: financeUk
  },
  en: {
    common: commonEn,
    finance: financeEn
  }
} as const;

function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readBrowserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }

  return navigator.language ? [navigator.language] : [];
}

export function applyDocumentLang(locale: AppLocale): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
}

export function persistLocale(locale: AppLocale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Persistence is best-effort; UI still switches in-memory.
  }
}

export function getActiveLocale(instance: I18nInstance = i18n): AppLocale {
  const language = instance.resolvedLanguage ?? instance.language;
  return isAppLocale(language) ? language : DEFAULT_LOCALE;
}

export async function setAppLocale(locale: AppLocale): Promise<AppLocale> {
  if (!isAppLocale(locale)) {
    return getActiveLocale();
  }

  await i18n.changeLanguage(locale);
  persistLocale(locale);
  applyDocumentLang(locale);
  return locale;
}

function initOptions(locale: AppLocale) {
  return {
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["uk", "en"] as string[],
    defaultNS: "common",
    ns: [...i18nNamespaces],
    interpolation: {
      escapeValue: false
    },
    returnNull: false,
    saveMissing: false,
    react: {
      useSuspense: false
    }
  };
}

/** Isolated instance for unit tests (does not replace the app singleton). */
export function createTestI18n(options?: {
  locale?: AppLocale;
  stored?: string | null;
  browserLanguages?: readonly string[];
  omitEnFinanceKeys?: readonly string[];
}) {
  const locale =
    options?.locale ??
    resolveInitialLocale({
      stored: options?.stored ?? null,
      browserLanguages: options?.browserLanguages ?? []
    });

  const instance = createInstance();
  const enFinance: Record<string, string> = { ...financeEn };
  for (const key of options?.omitEnFinanceKeys ?? []) {
    delete enFinance[key];
  }

  void instance.use(initReactI18next).init({
    ...initOptions(locale),
    resources: {
      uk: {
        common: commonUk,
        finance: financeUk
      },
      en: {
        common: commonEn,
        finance: enFinance
      }
    }
  });

  return instance;
}

const bootstrapLocale = resolveInitialLocale({
  stored: typeof window !== "undefined" ? readStoredLocale() : null,
  browserLanguages: typeof window !== "undefined" ? readBrowserLanguages() : []
});

void i18n.use(initReactI18next).init(initOptions(bootstrapLocale));
applyDocumentLang(bootstrapLocale);

export default i18n;
