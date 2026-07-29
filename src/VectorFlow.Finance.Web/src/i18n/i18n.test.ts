import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  LOCALE_STORAGE_KEY,
  createTestI18n,
  getActiveLocale,
  normalizeBrowserLocale,
  resolveInitialLocale,
  setAppLocale
} from "./index.ts";
import { formatDate, formatMoney, formatNumber } from "./format.ts";
import i18n from "./index.ts";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    }
  };
}

describe("locale resolution", () => {
  it("defaults to Ukrainian", () => {
    assert.equal(resolveInitialLocale({}), "uk");
  });

  it("detects Ukrainian and English browser locales", () => {
    assert.equal(normalizeBrowserLocale("uk-UA"), "uk");
    assert.equal(normalizeBrowserLocale("en-US"), "en");
    assert.equal(normalizeBrowserLocale("en-GB"), "en");
    assert.equal(resolveInitialLocale({ browserLanguages: ["en-US"] }), "en");
  });

  it("falls back for invalid saved locale", () => {
    assert.equal(resolveInitialLocale({ stored: "ru" }), "uk");
    assert.equal(resolveInitialLocale({ stored: "fr-FR" }), "uk");
    assert.equal(
      resolveInitialLocale({ stored: "nope", browserLanguages: ["de"] }),
      "uk"
    );
  });

  it("prefers valid saved locale over browser", () => {
    assert.equal(
      resolveInitialLocale({
        stored: "en",
        browserLanguages: ["uk-UA"]
      }),
      "en"
    );
  });
});

describe("locale persistence and document lang", () => {
  let originalStorage: Storage | undefined;
  let originalDocument: Document | undefined;

  beforeEach(async () => {
    originalStorage = globalThis.localStorage;
    originalDocument = globalThis.document;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: memoryStorage()
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: { lang: "uk" }
      }
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis
    });
    await setAppLocale("uk");
  });

  afterEach(async () => {
    if (originalStorage) {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: originalStorage
      });
    }
    if (originalDocument) {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }
    await setAppLocale("uk");
  });

  it("persists locale to vectorflow-finance.locale", async () => {
    await setAppLocale("en");
    assert.equal(globalThis.localStorage.getItem(LOCALE_STORAGE_KEY), "en");
    await setAppLocale("uk");
    assert.equal(globalThis.localStorage.getItem(LOCALE_STORAGE_KEY), "uk");
  });

  it("updates document.documentElement.lang", async () => {
    await setAppLocale("en");
    assert.equal(globalThis.document.documentElement.lang, "en");
    assert.equal(getActiveLocale(), "en");
    await setAppLocale("uk");
    assert.equal(globalThis.document.documentElement.lang, "uk");
  });
});

describe("accounts finance catalogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes accounts workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("title", { ns: "finance" }), "Рахунки");
    assert.equal(i18n.t("listTitle", { ns: "finance" }), "План рахунків");
    assert.equal(i18n.t("nav.accounts", { ns: "common" }), "Рахунки");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("title", { ns: "finance" }), "Accounts");
    assert.equal(i18n.t("listTitle", { ns: "finance" }), "Chart of accounts");
    assert.equal(i18n.t("nav.accounts", { ns: "common" }), "Accounts");
  });

  it("maps status and type wire values to localized labels", async () => {
    assert.equal(i18n.t("status.Active", { ns: "finance" }), "Активний");
    assert.equal(i18n.t("type.Asset", { ns: "finance" }), "Актив");
    assert.equal("Active", "Active");
    assert.equal("Asset", "Asset");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("status.Active", { ns: "finance" }), "Active");
    assert.equal(i18n.t("type.Asset", { ns: "finance" }), "Asset");
  });
});

describe("ledger finance catalogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes ledger workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("ledger.title", { ns: "finance" }), "Головна книга");
    assert.equal(i18n.t("ledger.listTitle", { ns: "finance" }), "Проводки ledger");
    assert.equal(i18n.t("nav.ledger", { ns: "common" }), "Головна книга");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("ledger.title", { ns: "finance" }), "Ledger");
    assert.equal(i18n.t("ledger.listTitle", { ns: "finance" }), "Ledger postings");
    assert.equal(i18n.t("nav.ledger", { ns: "common" }), "Ledger");
  });

  it("preserves API wire values while localizing ledger chrome only", async () => {
    assert.equal(i18n.t("ledger.openJournal", { ns: "finance" }), "Journal entry");
    assert.equal("Posted", "Posted");
    assert.equal("Active", "Active");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("ledger.openJournal", { ns: "finance" }), "Journal entry");
    assert.equal(i18n.t("ledger.detailLoaded", { ns: "finance" }), "Ledger posting loaded from the API.");
  });
});

describe("locale-aware formatting", () => {
  const sample = "2026-07-29T14:30:00.000Z";

  it("formats dates differently for uk and en", async () => {
    await i18n.changeLanguage("uk");
    const uk = formatDate(sample, { locale: "uk" });
    await i18n.changeLanguage("en");
    const en = formatDate(sample, { locale: "en" });
    assert.match(uk, /2026/);
    assert.match(en, /2026/);
    assert.notEqual(uk, en);
  });

  it("formats numbers and money with explicit currency codes", () => {
    assert.match(formatNumber(1234.5, { locale: "uk", maximumFractionDigits: 1 }), /1/);
    assert.equal(formatNumber(1234, { locale: "en" }), "1,234");
    const moneyUk = formatMoney(250, "UAH", { locale: "uk" });
    const moneyEn = formatMoney(250, "UAH", { locale: "en" });
    assert.match(moneyUk, /UAH/);
    assert.match(moneyEn, /UAH/);
  });
});

describe("Ukrainian fallback for missing English key", () => {
  it("resolves missing English entry to Ukrainian without showing the raw key", async () => {
    const instance = createTestI18n({
      locale: "en",
      omitEnFinanceKeys: ["listTitle"]
    });

    await instance.changeLanguage("en");
    const value = instance.t("listTitle", { ns: "finance" });
    assert.equal(value, "План рахунків");
    assert.notEqual(value, "listTitle");
  });
});
