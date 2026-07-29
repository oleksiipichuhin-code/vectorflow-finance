/**
 * Browser verification for Journals workflow i18n adoption.
 * Seeds via Finance API, walks Ukrainian + English with Playwright Chromium.
 */
import { chromium } from "playwright";

const API = process.env.VITE_FINANCE_API_BASE_URL || "http://localhost:5080";
const WEB = process.env.FINANCE_WEB_URL || "http://127.0.0.1:5173";

const result = {
  startUrl: "",
  intermediateUrls: [],
  finalReloadUrl: "",
  journalEntryId: "",
  accountId: "",
  workspaceId: "",
  expectedVisible: [],
  observedVisible: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  httpFailures: [],
  ok: false,
  blocker: null
};

async function apiJson(path, init) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status} ${path}: ${text}`);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function seed() {
  const workspace = await apiJson("/api/finance-workspaces", {
    method: "POST",
    body: JSON.stringify({
      platformOrganizationId: crypto.randomUUID(),
      platformWorkspaceId: crypto.randomUUID(),
      name: "Journals i18n browser verify",
      defaultCurrency: "UAH"
    })
  });
  const ws = workspace.id;
  const cash = await apiJson(`/api/finance-workspaces/${ws}/accounts`, {
    method: "POST",
    body: JSON.stringify({ code: "1020", name: "Cash verify", type: "Asset" })
  });
  const revenue = await apiJson(`/api/finance-workspaces/${ws}/accounts`, {
    method: "POST",
    body: JSON.stringify({ code: "4020", name: "Revenue verify", type: "Revenue" })
  });
  const journal = await apiJson(`/api/finance-workspaces/${ws}/journal-entries`, {
    method: "POST",
    body: JSON.stringify({ name: "Verify journals workflow" })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: cash.id,
      debit: 175,
      credit: 0,
      description: "Cash debit"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: revenue.id,
      debit: 0,
      credit: 175,
      description: "Revenue credit"
    })
  });
  return {
    workspaceId: ws,
    journalEntryId: journal.id,
    accountId: cash.id,
    accountCode: cash.code
  };
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.journalEntryId = seeded.journalEntryId;
  result.accountId = seeded.accountId;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      result.consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    result.pageErrors.push(String(err));
  });
  page.on("requestfailed", (req) => {
    result.failedRequests.push(`${req.failure()?.errorText || "failed"} ${req.url()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      result.httpFailures.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto(WEB, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.removeItem("vectorflow-finance.locale");
  });

  const startUrl = `${WEB}/?view=journals&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Default Ukrainian
  await page.getByRole("heading", { name: "Журнальні проводки", exact: true }).waitFor({
    timeout: 15000
  });
  await page.getByRole("heading", { name: "Нова журнальна проводка" }).waitFor();
  await page.getByRole("heading", { name: "Рахунки (план рахунків)" }).waitFor();
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await page.locator(`tr[data-row-id="${seeded.journalEntryId}"]`).waitFor({ timeout: 15000 });
  result.observedVisible.push("uk journals list present");
  result.expectedVisible.push("uk journals list present");

  // Status filter Draft
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#journals-heading") })
    .getByLabel("Статус")
    .selectOption("Draft");
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#journals-heading") })
    .getByRole("button", { name: "Застосувати фільтр" })
    .click();
  await page.waitForTimeout(400);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("status=Draft")) {
    throw new Error(`Filter URL missing status=Draft: ${page.url()}`);
  }
  await page.locator(`tr[data-row-id="${seeded.journalEntryId}"]`).waitFor();
  result.observedVisible.push("uk filtered Draft list");
  result.expectedVisible.push("uk filtered Draft list");

  // Open detail
  await page
    .locator(`tr[data-row-id="${seeded.journalEntryId}"]`)
    .getByRole("button", { name: "Деталі" })
    .click();
  await page.getByRole("heading", { name: "Деталі журнальної проводки" }).waitFor({
    timeout: 10000
  });
  await page.getByRole("button", { name: "Провести journal entry" }).waitFor();
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`journalEntryId=${seeded.journalEntryId}`)) {
    throw new Error(`Detail URL missing journalEntryId: ${page.url()}`);
  }
  result.observedVisible.push("uk detail loaded");
  result.expectedVisible.push("uk detail loaded");

  // Post journal entry
  await page.getByRole("button", { name: "Провести journal entry" }).click();
  await page.getByText("Journal entry проведено (Posted). Далі — Post to ledger.").waitFor({
    timeout: 15000
  });
  await page.getByRole("button", { name: "Post to ledger" }).waitFor({ timeout: 10000 });
  result.observedVisible.push("uk post journal succeeded");
  result.expectedVisible.push("uk post journal succeeded");

  // Post to ledger
  await page.getByRole("button", { name: "Post to ledger" }).click();
  await page.getByText("Ledger posting створено. Стан збережено на сервері.").waitFor({
    timeout: 15000
  });
  await page.getByText("Ledger posting", { exact: true }).waitFor();
  result.observedVisible.push("uk post to ledger succeeded");
  result.expectedVisible.push("uk post to ledger succeeded");

  // Switch to English without leaving route/selection
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("heading", { name: "Journal entries", exact: true }).waitFor({
    timeout: 10000
  });
  await page.getByRole("heading", { name: "Journal entry detail" }).waitFor();
  await page.getByRole("heading", { name: "New journal entry" }).waitFor();
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#journal-detail-heading") })
    .getByText("Ledger posting", { exact: true })
    .waitFor({ timeout: 10000 });
  if (page.url() !== beforeSwitch) {
    throw new Error(`Language switch changed URL: ${beforeSwitch} -> ${page.url()}`);
  }
  const enLang = await page.locator("html").getAttribute("lang");
  if (enLang !== "en") {
    throw new Error(`Expected html lang=en, got ${enLang}`);
  }
  const storedEn = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedEn !== "en") {
    throw new Error(`Expected stored locale en, got ${storedEn}`);
  }
  // No raw keys
  const bodyText = await page.locator("main").innerText();
  if (bodyText.includes("journals.") || bodyText.includes("nav.journals")) {
    throw new Error("Raw translation keys visible in English UI");
  }
  result.observedVisible.push("en switch preserved route");
  result.expectedVisible.push("en switch preserved route");

  // Clear status filter so Posted entry remains visible, then refresh in English
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#journals-heading") })
    .getByRole("button", { name: "Clear" })
    .click();
  await page.waitForTimeout(300);
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#journals-heading") })
    .getByRole("button", { name: "Refresh" })
    .click();
  await page.locator(`tr[data-row-id="${seeded.journalEntryId}"]`).waitFor({ timeout: 10000 });
  result.observedVisible.push("en refresh succeeded");
  result.expectedVisible.push("en refresh succeeded");

  // Dashboard handoff card uses localized nav
  await page.goto(`${WEB}/?view=dashboard&workspaceId=${seeded.workspaceId}`, {
    waitUntil: "networkidle"
  });
  await page.getByRole("button", { name: /Journals/ }).first().waitFor({ timeout: 10000 });
  await page.getByText("Journal entries and post to ledger").waitFor();
  result.observedVisible.push("en dashboard journals card");
  result.expectedVisible.push("en dashboard journals card");

  // Deep link back to journals detail and reload — English persists
  const detailUrl = `${WEB}/?view=journals&workspaceId=${seeded.workspaceId}&journalEntryId=${seeded.journalEntryId}`;
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Journal entry detail" }).waitFor({ timeout: 15000 });
  await page.getByText("Ledger posting", { exact: true }).waitFor({ timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Journal entries", exact: true }).waitFor({
    timeout: 15000
  });
  await page.getByRole("heading", { name: "Journal entry detail" }).waitFor({ timeout: 15000 });
  const storedAfterReload = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedAfterReload !== "en") {
    throw new Error(`English did not persist across reload: ${storedAfterReload}`);
  }
  result.observedVisible.push("en persisted across reload");
  result.expectedVisible.push("en persisted across reload");

  // Switch back to Ukrainian and reload
  await page.getByRole("button", { name: "Ukrainian" }).click();
  await page.getByRole("heading", { name: "Журнальні проводки", exact: true }).waitFor({
    timeout: 10000
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Журнальні проводки", exact: true }).waitFor({
    timeout: 15000
  });
  await page.getByRole("heading", { name: "Деталі журнальної проводки" }).waitFor({
    timeout: 15000
  });
  await page.getByText("Ledger posting", { exact: true }).waitFor({ timeout: 10000 });
  const storedUk = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedUk !== "uk") {
    throw new Error(`Ukrainian did not persist across reload: ${storedUk}`);
  }
  const ukBody = await page.locator("main").innerText();
  if (ukBody.includes("journals.") || ukBody.includes("nav.journals")) {
    throw new Error("Raw translation keys visible in Ukrainian UI");
  }
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=journals")) {
    throw new Error(`Reload lost journals view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`journalEntryId=${seeded.journalEntryId}`)) {
    throw new Error(`Reload lost journalEntryId: ${result.finalReloadUrl}`);
  }
  result.observedVisible.push("uk persisted across reload with detail");
  result.expectedVisible.push("uk persisted across reload with detail");

  result.failedRequests = result.failedRequests.filter(
    (line) => !line.includes("favicon") && !line.includes("ERR_ABORTED")
  );
  result.httpFailures = result.httpFailures.filter((line) => !line.includes("favicon"));

  if (
    result.consoleErrors.length ||
    result.pageErrors.length ||
    result.failedRequests.length ||
    result.httpFailures.length
  ) {
    result.blocker = "Unexpected browser errors or failed requests";
  } else {
    result.ok = true;
  }

  await browser.close();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  result.blocker = String(err);
  console.log(JSON.stringify(result, null, 2));
  console.error(err);
  process.exit(1);
});
