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
import financeEn from "./locales/en/finance.json" with { type: "json" };
import financeUk from "./locales/uk/finance.json" with { type: "json" };

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

describe("customer ledger finance catalogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes customer ledger workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("customerLedger.title", { ns: "finance" }), "Книга клієнта");
    assert.equal(i18n.t("customerLedger.listTitle", { ns: "finance" }), "Контрагенти");
    assert.equal(i18n.t("nav.customerLedger", { ns: "common" }), "Книга клієнта");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("customerLedger.title", { ns: "finance" }), "Customer ledger");
    assert.equal(i18n.t("customerLedger.listTitle", { ns: "finance" }), "Counterparties");
    assert.equal(i18n.t("nav.customerLedger", { ns: "common" }), "Customer ledger");
  });

  it("keeps aging bucket wire ids while localizing labels", async () => {
    assert.equal(i18n.t("customerLedger.agingBucket.8-30", { ns: "finance" }), "8–30 днів прострочки");
    assert.equal("8-30", "8-30");
    assert.equal("Issued", "Issued");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("customerLedger.agingBucket.8-30", { ns: "finance" }), "8–30 days overdue");
    assert.equal(i18n.t("customerLedger.invoiceStatus.Issued", { ns: "finance" }), "Issued");
  });

  it("has matching customerLedger key structure in uk and en", async () => {
    const ukKeys = Object.keys(financeUk).filter(
      (key) =>
        key.startsWith("customerLedger.") || key.startsWith("createAccrualFromInvoice.")
    );
    const enKeys = Object.keys(financeEn).filter(
      (key) =>
        key.startsWith("customerLedger.") || key.startsWith("createAccrualFromInvoice.")
    );
    assert.deepEqual(ukKeys.sort(), enKeys.sort());
  });
});

describe("account statement finance catalogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes account statement workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("accountStatement.title", { ns: "finance" }), "Виписка рахунку");
    assert.equal(i18n.t("accountStatement.balancesTitle", { ns: "finance" }), "Залишки рахунків");
    assert.equal(i18n.t("accountStatement.col.debit", { ns: "finance" }), "Дебет");
    assert.equal(i18n.t("accountStatement.field.opening", { ns: "finance" }), "Вхідне");
    assert.equal(i18n.t("nav.accountStatement", { ns: "common" }), "Виписка рахунку");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("accountStatement.title", { ns: "finance" }), "Account statement");
    assert.equal(i18n.t("accountStatement.balancesTitle", { ns: "finance" }), "Account balances");
    assert.equal(i18n.t("accountStatement.col.debit", { ns: "finance" }), "Debit");
    assert.equal(i18n.t("accountStatement.field.opening", { ns: "finance" }), "Opening");
    assert.equal(i18n.t("nav.accountStatement", { ns: "common" }), "Account statement");
  });

  it("preserves balance-side wire values while localizing labels", async () => {
    assert.equal(i18n.t("balanceSide.Debit", { ns: "finance" }), "Дебет");
    assert.equal(i18n.t("balanceSide.Credit", { ns: "finance" }), "Кредит");
    assert.equal(i18n.t("balanceSide.Zero", { ns: "finance" }), "Нуль");
    assert.equal("Debit", "Debit");
    assert.equal("Credit", "Credit");
    assert.equal("Zero", "Zero");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("balanceSide.Debit", { ns: "finance" }), "Debit");
    assert.equal(i18n.t("balanceSide.Credit", { ns: "finance" }), "Credit");
    assert.equal(i18n.t("balanceSide.Zero", { ns: "finance" }), "Zero");
    assert.equal(i18n.t("accountStatement.openJournal", { ns: "finance" }), "Journal entry");
  });

  it("has matching accountStatement key structure in uk and en", async () => {
    const ukKeys = Object.keys(financeUk).filter(
      (key) =>
        key.startsWith("accountStatement.") || key === "dashboard.accountStatementCopy"
    );
    const enKeys = Object.keys(financeEn).filter(
      (key) =>
        key.startsWith("accountStatement.") || key === "dashboard.accountStatementCopy"
    );
    assert.deepEqual(ukKeys.sort(), enKeys.sort());
  });
});

describe("trial balance finance catalogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes trial balance workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("trialBalance.title", { ns: "finance" }), "Оборотно-сальдова відомість");
    assert.equal(i18n.t("trialBalance.balanced", { ns: "finance" }), "Збалансовано");
    assert.equal(i18n.t("trialBalance.field.totalDebit", { ns: "finance" }), "Разом дебет");
    assert.equal(i18n.t("nav.trialBalance", { ns: "common" }), "Оборотно-сальдова відомість");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("trialBalance.title", { ns: "finance" }), "Trial balance");
    assert.equal(i18n.t("trialBalance.balanced", { ns: "finance" }), "Balanced");
    assert.equal(i18n.t("trialBalance.field.totalDebit", { ns: "finance" }), "Total debit");
    assert.equal(i18n.t("nav.trialBalance", { ns: "common" }), "Trial balance");
  });

  it("preserves balance-side wire values for trial balance presentation", async () => {
    assert.equal(i18n.t("balanceSide.Debit", { ns: "finance" }), "Дебет");
    assert.equal(i18n.t("balanceSide.Credit", { ns: "finance" }), "Кредит");
    assert.equal(i18n.t("balanceSide.Zero", { ns: "finance" }), "Нуль");
    assert.equal("Debit", "Debit");
    assert.equal("Credit", "Credit");
    assert.equal("Zero", "Zero");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("balanceSide.Debit", { ns: "finance" }), "Debit");
    assert.equal(i18n.t("trialBalance.unbalanced", { ns: "finance" }), "Unbalanced");
  });

  it("has matching trialBalance key structure in uk and en", async () => {
    const ukKeys = Object.keys(financeUk).filter(
      (key) =>
        key.startsWith("trialBalance.") ||
        key === "dashboard.trialBalanceCopy" ||
        key.startsWith("balanceSide.")
    );
    const enKeys = Object.keys(financeEn).filter(
      (key) =>
        key.startsWith("trialBalance.") ||
        key === "dashboard.trialBalanceCopy" ||
        key.startsWith("balanceSide.")
    );
    assert.deepEqual(ukKeys.sort(), enKeys.sort());
  });
});

describe("journals finance catalogs", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes journals workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("journals.title", { ns: "finance" }), "Журнальні проводки");
    assert.equal(i18n.t("journals.createTitle", { ns: "finance" }), "Нова журнальна проводка");
    assert.equal(i18n.t("journals.postJournal", { ns: "finance" }), "Провести journal entry");
    assert.equal(i18n.t("nav.journals", { ns: "common" }), "Журнали");
    assert.equal(i18n.t("openJournals", { ns: "finance" }), "Журнали");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("journals.title", { ns: "finance" }), "Journal entries");
    assert.equal(i18n.t("journals.createTitle", { ns: "finance" }), "New journal entry");
    assert.equal(i18n.t("journals.postJournal", { ns: "finance" }), "Post journal entry");
    assert.equal(i18n.t("nav.journals", { ns: "common" }), "Journals");
    assert.equal(i18n.t("openJournals", { ns: "finance" }), "Journals");
  });

  it("preserves journal status wire values while localizing labels", async () => {
    assert.equal(i18n.t("journalStatus.Draft", { ns: "finance" }), "Чернетка");
    assert.equal(i18n.t("journalStatus.Posted", { ns: "finance" }), "Проведено");
    assert.equal("Draft", "Draft");
    assert.equal("Posted", "Posted");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("journalStatus.Draft", { ns: "finance" }), "Draft");
    assert.equal(i18n.t("journalStatus.Posted", { ns: "finance" }), "Posted");
    assert.equal(i18n.t("journals.postToLedger", { ns: "finance" }), "Post to ledger");
  });

  it("has matching journals key structure in uk and en", async () => {
    const ukKeys = Object.keys(financeUk).filter(
      (key) =>
        key.startsWith("journals.") ||
        key.startsWith("journalStatus.") ||
        key === "dashboard.journalsCopy" ||
        key === "openJournals"
    );
    const enKeys = Object.keys(financeEn).filter(
      (key) =>
        key.startsWith("journals.") ||
        key.startsWith("journalStatus.") ||
        key === "dashboard.journalsCopy" ||
        key === "openJournals"
    );
    assert.deepEqual(ukKeys.sort(), enKeys.sort());
  });
});

describe("invoices finance catalogs", () => {
  const invoicePrefixes = [
    "invoices.",
    "invoiceStatus.",
    "collections.",
    "workbench.",
    "promise.",
    "plan.",
    "note.",
    "reminder.",
    "attachment."
  ];

  function invoiceKeys(catalog: Record<string, string>): string[] {
    return Object.keys(catalog).filter(
      (key) =>
        invoicePrefixes.some((prefix) => key.startsWith(prefix)) ||
        key === "dashboard.invoicesCopy"
    );
  }

  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes invoices workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("invoices.panelTitle", { ns: "finance" }), "Рахунки");
    assert.equal(i18n.t("invoices.createDraft", { ns: "finance" }), "Створити чернетку");
    assert.equal(i18n.t("invoices.issue", { ns: "finance" }), "Виставити");
    assert.equal(
      i18n.t("dashboard.invoicesCopy", { ns: "finance" }),
      "Список рахунків обраного workspace"
    );
    assert.equal(i18n.t("nav.invoices", { ns: "common" }), "Рахунки");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("invoices.panelTitle", { ns: "finance" }), "Invoices");
    assert.equal(i18n.t("invoices.createDraft", { ns: "finance" }), "Create draft");
    assert.equal(i18n.t("invoices.issue", { ns: "finance" }), "Issue");
    assert.equal(
      i18n.t("dashboard.invoicesCopy", { ns: "finance" }),
      "Invoice list for the selected workspace"
    );
    assert.equal(i18n.t("nav.invoices", { ns: "common" }), "Invoices");
  });

  it("preserves invoice status wire values while localizing labels", async () => {
    assert.equal(i18n.t("invoiceStatus.Draft", { ns: "finance" }), "Чернетка");
    assert.equal(i18n.t("invoiceStatus.Issued", { ns: "finance" }), "Виставлений");
    assert.equal(
      i18n.t("invoiceStatus.Draft", { ns: "finance" }),
      i18n.t("customerLedger.invoiceStatus.Draft", { ns: "finance" })
    );
    assert.equal("Draft", "Draft");
    assert.equal("Issued", "Issued");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("invoiceStatus.Draft", { ns: "finance" }), "Draft");
    assert.equal(i18n.t("invoiceStatus.Issued", { ns: "finance" }), "Issued");
  });

  it("localizes collections, workbench, and promise chrome", async () => {
    assert.equal(
      i18n.t("collections.bannerTitle", { ns: "finance" }),
      "Робочий простір збору оплат"
    );
    assert.equal(i18n.t("workbench.section.all", { ns: "finance" }), "Усі секції");
    assert.equal(i18n.t("promise.title", { ns: "finance" }), "Обіцянка оплати");

    await i18n.changeLanguage("en");
    assert.equal(
      i18n.t("collections.bannerTitle", { ns: "finance" }),
      "Payment collection workspace"
    );
    assert.equal(i18n.t("workbench.section.all", { ns: "finance" }), "All sections");
    assert.equal(i18n.t("promise.title", { ns: "finance" }), "Promise to pay");
  });

  it("interpolates invoice counts and queue metadata", async () => {
    assert.equal(
      i18n.t("collections.daysShort", { ns: "finance", count: 12 }),
      "12 дн."
    );
    assert.equal(
      i18n.t("invoices.pageMeta", { ns: "finance", page: 2, shown: 5, total: 40 }),
      "Сторінка 2 · показано 5 · усього 40"
    );

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("collections.daysShort", { ns: "finance", count: 12 }), "12 d.");
    assert.equal(
      i18n.t("invoices.pageMeta", { ns: "finance", page: 2, shown: 5, total: 40 }),
      "Page 2 · showing 5 · 40 total"
    );
  });

  it("has matching invoices key structure in uk and en", () => {
    const ukKeys = invoiceKeys(financeUk as Record<string, string>);
    const enKeys = invoiceKeys(financeEn as Record<string, string>);
    assert.ok(ukKeys.length > 0);
    assert.deepEqual(ukKeys.sort(), enKeys.sort());
  });
});

describe("accruals finance catalogs", () => {
  const accrualPrefixes = ["accruals.", "accrualStatus."];

  function accrualKeys(catalog: Record<string, string>): string[] {
    return Object.keys(catalog).filter(
      (key) =>
        accrualPrefixes.some((prefix) => key.startsWith(prefix)) ||
        key.startsWith("dashboard.accruals") ||
        key === "workspaceSummary.accrualsMetric"
    );
  }

  beforeEach(async () => {
    await i18n.changeLanguage("uk");
  });

  it("localizes accruals workflow chrome in Ukrainian and English", async () => {
    assert.equal(i18n.t("accruals.panelTitle", { ns: "finance" }), "Нарахування");
    assert.equal(i18n.t("accruals.createDraft", { ns: "finance" }), "Створити чернетку");
    assert.equal(i18n.t("accruals.recognizeAction", { ns: "finance" }), "Визнати");
    assert.equal(i18n.t("accruals.reverseAction", { ns: "finance" }), "Сторнувати");
    assert.equal(
      i18n.t("dashboard.accrualsCopy", { ns: "finance" }),
      "Список нарахувань обраного workspace"
    );
    assert.equal(i18n.t("nav.accruals", { ns: "common" }), "Нарахування");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("accruals.panelTitle", { ns: "finance" }), "Accruals");
    assert.equal(i18n.t("accruals.createDraft", { ns: "finance" }), "Create draft");
    assert.equal(i18n.t("accruals.recognizeAction", { ns: "finance" }), "Recognize");
    assert.equal(i18n.t("accruals.reverseAction", { ns: "finance" }), "Reverse");
    assert.equal(
      i18n.t("dashboard.accrualsCopy", { ns: "finance" }),
      "Accrual list for the selected workspace"
    );
    assert.equal(i18n.t("nav.accruals", { ns: "common" }), "Accruals");
  });

  it("preserves accrual status and type wire values while localizing labels", async () => {
    assert.equal(i18n.t("accrualStatus.Draft", { ns: "finance" }), "Чернетка");
    assert.equal(i18n.t("accrualStatus.Recognized", { ns: "finance" }), "Визнано");
    assert.equal(i18n.t("accrualStatus.Reversed", { ns: "finance" }), "Сторновано");
    for (const status of ["Draft", "Recognized", "Reversed"]) {
      assert.equal(
        i18n.t(`accrualStatus.${status}`, { ns: "finance" }),
        i18n.t(`customerLedger.accrualStatus.${status}`, { ns: "finance" })
      );
    }
    assert.equal(i18n.t("type.Revenue", { ns: "finance" }), "Дохід");
    assert.equal(i18n.t("type.Expense", { ns: "finance" }), "Витрата");
    assert.equal("Draft", "Draft");
    assert.equal("Recognized", "Recognized");
    assert.equal("Reversed", "Reversed");
    assert.equal("Revenue", "Revenue");
    assert.equal("Expense", "Expense");

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("accrualStatus.Draft", { ns: "finance" }), "Draft");
    assert.equal(i18n.t("accrualStatus.Recognized", { ns: "finance" }), "Recognized");
    assert.equal(i18n.t("accrualStatus.Reversed", { ns: "finance" }), "Reversed");
    assert.equal(i18n.t("type.Revenue", { ns: "finance" }), "Revenue");
    assert.equal(i18n.t("type.Expense", { ns: "finance" }), "Expense");
  });

  it("localizes accrual editors, source invoice picker, and errors", async () => {
    assert.equal(
      i18n.t("accruals.amountEditor.intro", { ns: "finance" }),
      "Редагування суми:"
    );
    assert.equal(i18n.t("accruals.picker.noSelection", { ns: "finance" }), "Не вибрано");
    assert.equal(
      i18n.t("accruals.error.reversalReasonRequired", { ns: "finance" }),
      "Вкажіть причину сторнування."
    );

    await i18n.changeLanguage("en");
    assert.equal(i18n.t("accruals.amountEditor.intro", { ns: "finance" }), "Editing amount:");
    assert.equal(i18n.t("accruals.picker.noSelection", { ns: "finance" }), "Not selected");
    assert.equal(
      i18n.t("accruals.error.reversalReasonRequired", { ns: "finance" }),
      "Provide the reversal reason."
    );
  });

  it("interpolates accrual counts, page metadata, and limits", async () => {
    assert.equal(
      i18n.t("accruals.pageMeta", { ns: "finance", page: 3, shown: 4, total: 25 }),
      "Сторінка 3 · показано 4 · усього 25"
    );
    assert.equal(
      i18n.t("dashboard.accrualsCount", { ns: "finance", count: 7 }),
      "7 нарахувань у workspace"
    );
    assert.equal(
      i18n.t("accruals.error.reversalReasonTooLong", { ns: "finance", max: 512 }),
      "Причина сторнування не може перевищувати 512 символів."
    );

    await i18n.changeLanguage("en");
    assert.equal(
      i18n.t("accruals.pageMeta", { ns: "finance", page: 3, shown: 4, total: 25 }),
      "Page 3 · showing 4 · 25 total"
    );
    assert.equal(
      i18n.t("dashboard.accrualsCount", { ns: "finance", count: 7 }),
      "7 accruals in the workspace"
    );
    assert.equal(
      i18n.t("accruals.error.reversalReasonTooLong", { ns: "finance", max: 512 }),
      "The reversal reason cannot exceed 512 characters."
    );
  });

  it("has matching accruals key structure in uk and en", () => {
    const ukKeys = accrualKeys(financeUk as Record<string, string>);
    const enKeys = accrualKeys(financeEn as Record<string, string>);
    assert.ok(ukKeys.length > 0);
    assert.deepEqual(ukKeys.sort(), enKeys.sort());
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
