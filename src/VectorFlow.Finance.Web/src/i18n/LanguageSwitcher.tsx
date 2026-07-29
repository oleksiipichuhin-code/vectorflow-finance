import { useTranslation } from "react-i18next";
import { getActiveLocale, setAppLocale } from "./index.ts";
import { SUPPORTED_LOCALES, type AppLocale } from "./locales.ts";

const SHORT_LABEL: Record<AppLocale, string> = {
  uk: "UA",
  en: "EN"
};

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation("common");
  const active = getActiveLocale(i18n);

  return (
    <div className="language-switcher" role="group" aria-label={t("languageSwitcher")}>
      {SUPPORTED_LOCALES.map((locale) => {
        const selected = locale === active;
        return (
          <button
            key={locale}
            type="button"
            className={
              selected
                ? "language-switcher__button language-switcher__button--active"
                : "language-switcher__button"
            }
            aria-pressed={selected}
            aria-label={t(`language.${locale}`)}
            title={t(`language.${locale}`)}
            onClick={() => {
              void setAppLocale(locale);
            }}
          >
            {SHORT_LABEL[locale]}
          </button>
        );
      })}
    </div>
  );
}
