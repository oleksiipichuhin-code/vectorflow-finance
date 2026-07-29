/**
 * Browser verification for Account Statement i18n adoption.
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
  accountCode: "",
  workspaceId: "",
  periodFrom: "",
  periodTo: "",
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
      name: "Account statement i18n browser verify",
      defaultCurrency: "UAH"
    })
  });
  const ws = workspace.id;
  const cash = await apiJson(`/api/finance-workspaces/${ws}/accounts`, {
    method: "POST",
    body: JSON.stringify({ code: "1010", name: "Operating Cash", type: "Asset" })
  });
  const revenue = await apiJson(`/api/finance-workspaces/${ws}/accounts`, {
    method: "POST",
    body: JSON.stringify({ code: "4010", name: "Sales Revenue", type: "Revenue" })
  });
  const journal = await apiJson(`/api/finance-workspaces/${ws}/journal-entries`, {
    method: "POST",
    body: JSON.stringify({ name: "Verify account statement" })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: cash.id,
      debit: 500,
      credit: 0,
      description: "Cash debit"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: revenue.id,
      debit: 0,
      credit: 500,
      description: "Revenue credit"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/post`, {
    method: "POST",
    body: "{}"
  });
  await apiJson(`/api/finance-workspaces/${ws}/ledger/post`, {
    method: "POST",
    body: JSON.stringify({ journalEntryId: journal.id })
  });
  return {
    workspaceId: ws,
    journalEntryId: journal.id,
    accountId: cash.id,
    accountCode: cash.code
  };
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.journalEntryId = seeded.journalEntryId;
  result.accountId = seeded.accountId;
  result.accountCode = seeded.accountCode;

  const day = todayUtcDate();
  result.periodFrom = day;
  result.periodTo = day;

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

  const startUrl = `${WEB}/?view=account-statement&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Default Ukrainian (hero h1 shares title with empty-detail panel h2)
  await page.getByRole("heading", { name: "Виписка рахунку", exact: true }).first().waitFor({
    timeout: 15000
  });
  await page.getByRole("heading", { name: "Залишки рахунків" }).waitFor();
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await page.locator(`tr[data-row-id="${seeded.accountId}"]`).waitFor({ timeout: 15000 });
  result.observedVisible.push("uk balances list present");
  result.expectedVisible.push("uk balances list present");

  // Open statement for cash account
  await page
    .locator(`tr[data-row-id="${seeded.accountId}"]`)
    .getByRole("button", { name: "Виписка" })
    .click();
  await page.getByRole("heading", { name: "Виписка рахунку" }).nth(1).waitFor({
    timeout: 10000
  });
  await page.getByText(`${seeded.accountCode} ·`).waitFor({ timeout: 10000 });
  await page.getByText("Вхідне", { exact: true }).waitFor();
  await page.getByText("Вихідне", { exact: true }).waitFor();
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`accountId=${seeded.accountId}`)) {
    throw new Error(`Detail URL missing accountId: ${page.url()}`);
  }
  result.observedVisible.push("uk statement detail loaded");
  result.expectedVisible.push("uk statement detail loaded");

  // Apply period filter
  await page.locator('input[type="date"]').nth(0).fill(day);
  await page.locator('input[type="date"]').nth(1).fill(day);
  await page.getByRole("button", { name: "Застосувати період" }).click();
  await page.waitForTimeout(400);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`periodFrom=${day}`) || !page.url().includes(`periodTo=${day}`)) {
    throw new Error(`Period URL missing dates: ${page.url()}`);
  }
  await page.getByText("Cash debit").waitFor({ timeout: 10000 });
  result.observedVisible.push("uk period filtered lines");
  result.expectedVisible.push("uk period filtered lines");

  // Switch to English without leaving route/selection
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("heading", { name: "Account statement", exact: true }).first().waitFor({
    timeout: 10000
  });
  await page.getByText("Opening", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("Closing", { exact: true }).waitFor();
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
  result.observedVisible.push("en switch preserved route");
  result.expectedVisible.push("en switch preserved route");

  // Refresh statement in English
  await page.getByRole("button", { name: "Refresh statement" }).click();
  await page.getByText("Cash debit").waitFor({ timeout: 10000 });
  result.observedVisible.push("en refresh statement succeeded");
  result.expectedVisible.push("en refresh statement succeeded");

  // Journal entry handoff
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#account-statement-detail-heading") })
    .getByRole("button", { name: "Journal entry", exact: true })
    .first()
    .click();
  await page.waitForURL(/view=journals/, { timeout: 10000 });
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`journalEntryId=${seeded.journalEntryId}`)) {
    throw new Error(`Journal handoff URL missing journalEntryId: ${page.url()}`);
  }
  result.observedVisible.push("journal handoff");
  result.expectedVisible.push("journal handoff");

  // Return to statement deep link and reload — English persists
  const returnUrl = `${WEB}/?view=account-statement&workspaceId=${seeded.workspaceId}&accountId=${seeded.accountId}&periodFrom=${day}&periodTo=${day}`;
  await page.goto(returnUrl, { waitUntil: "networkidle" });
  await page.getByText("Opening", { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText("Cash debit").waitFor({ timeout: 10000 });
  result.observedVisible.push("return restored statement in English");
  result.expectedVisible.push("return restored statement in English");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Account statement", exact: true }).first().waitFor({
    timeout: 15000
  });
  await page.getByText("Opening", { exact: true }).waitFor({ timeout: 15000 });
  const storedAfterReload = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedAfterReload !== "en") {
    throw new Error(`English did not persist across reload: ${storedAfterReload}`);
  }
  if (!page.url().includes(`accountId=${seeded.accountId}`)) {
    throw new Error(`Reload lost accountId: ${page.url()}`);
  }
  if (!page.url().includes(`periodFrom=${day}`)) {
    throw new Error(`Reload lost periodFrom: ${page.url()}`);
  }
  result.observedVisible.push("en persisted across reload");
  result.expectedVisible.push("en persisted across reload");

  // Switch back to Ukrainian and reload
  await page.getByRole("button", { name: "Ukrainian" }).click();
  await page.getByRole("heading", { name: "Виписка рахунку", exact: true }).first().waitFor({
    timeout: 10000
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Виписка рахунку", exact: true }).first().waitFor({
    timeout: 15000
  });
  await page.getByText("Вхідне", { exact: true }).waitFor({ timeout: 15000 });
  await page.locator(`tr[data-row-id="${seeded.accountId}"]`).waitFor();
  const storedUk = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedUk !== "uk") {
    throw new Error(`Ukrainian did not persist across reload: ${storedUk}`);
  }
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=account-statement")) {
    throw new Error(`Reload lost account-statement view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`accountId=${seeded.accountId}`)) {
    throw new Error(`Reload lost accountId: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`periodFrom=${day}`)) {
    throw new Error(`Reload lost periodFrom: ${result.finalReloadUrl}`);
  }
  result.observedVisible.push("uk persisted across reload with statement");
  result.expectedVisible.push("uk persisted across reload with statement");

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
