/**
 * Browser verification for Chart of Accounts i18n adoption.
 * Seeds via Finance API, walks Ukrainian + English with Playwright Chromium.
 */
import { chromium } from "playwright";

const API = process.env.VITE_FINANCE_API_BASE_URL || "http://localhost:5080";
const WEB = process.env.FINANCE_WEB_URL || "http://127.0.0.1:5173";

const result = {
  startUrl: "",
  intermediateUrls: [],
  finalReloadUrl: "",
  accountId: "",
  archivedAccountId: "",
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
      name: "Accounts i18n browser verify",
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
  return {
    workspaceId: ws,
    cashId: cash.id,
    revenueId: revenue.id
  };
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.accountId = seeded.cashId;

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

  // Establish origin, clear prior locale once, then open Accounts in default Ukrainian.
  await page.goto(WEB, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.removeItem("vectorflow-finance.locale");
  });

  const startUrl = `${WEB}/?view=accounts&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Default Ukrainian
  await page.getByRole("heading", { name: "Рахунки", exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "План рахунків" }).waitFor();
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await page.locator(`tr[data-row-id="${seeded.cashId}"]`).waitFor({ timeout: 15000 });
  result.observedVisible.push("uk accounts list present");
  result.expectedVisible.push("uk accounts list present");

  // Filter in Ukrainian
  await page.getByPlaceholder("Код або назва").fill("cash");
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#accounts-list-heading") })
    .getByLabel("Тип")
    .selectOption("Asset");
  await page.getByRole("button", { name: "Застосувати фільтр" }).click();
  await page.waitForTimeout(400);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("accountQ=cash") || !page.url().includes("type=Asset")) {
    throw new Error(`Filter URL missing accountQ/type: ${page.url()}`);
  }
  await page.locator(`tr[data-row-id="${seeded.cashId}"]`).waitFor();
  result.observedVisible.push("uk filtered list");
  result.expectedVisible.push("uk filtered list");

  // Open detail
  await page
    .locator(`tr[data-row-id="${seeded.cashId}"]`)
    .getByRole("button", { name: "Відкрити" })
    .click();
  await page.getByText("Рахунок завантажено з API.").waitFor({ timeout: 10000 });
  if (!page.url().includes(`accountId=${seeded.cashId}`)) {
    throw new Error(`Detail URL missing accountId: ${page.url()}`);
  }
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("uk detail loaded");
  result.expectedVisible.push("uk detail loaded");

  // Switch to English without leaving route/selection
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("heading", { name: "Accounts", exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("Account loaded from the API.").waitFor({ timeout: 10000 });
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

  // Meaningful action in English: rename then archive
  await page.getByLabel("Rename").fill("Petty Cash");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByText("Account name updated.").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Archive account" }).click();
  await page.getByText("Account archived.").waitFor({ timeout: 10000 });
  result.archivedAccountId = seeded.cashId;
  result.observedVisible.push("en rename+archive persisted");
  result.expectedVisible.push("en rename+archive persisted");

  // Reload — English persists
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Accounts", exact: true }).waitFor({ timeout: 15000 });
  await page.getByText("Account loaded from the API.").waitFor({ timeout: 15000 });
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
  await page.getByRole("heading", { name: "Рахунки", exact: true }).waitFor({ timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Рахунки", exact: true }).waitFor({ timeout: 15000 });
  const storedUk = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedUk !== "uk") {
    throw new Error(`Ukrainian did not persist across reload: ${storedUk}`);
  }
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=accounts")) {
    throw new Error(`Reload lost accounts view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`accountId=${seeded.cashId}`)) {
    throw new Error(`Reload lost accountId: ${result.finalReloadUrl}`);
  }
  result.observedVisible.push("uk persisted across reload with detail");
  result.expectedVisible.push("uk persisted across reload with detail");

  // Handoff still works
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#accounts-detail-heading") })
    .getByRole("button", { name: "Виписка рахунку" })
    .click();
  await page.waitForURL(
    new RegExp(`view=account-statement.*accountId=${seeded.cashId}`),
    { timeout: 10000 }
  );
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("account statement handoff");
  result.expectedVisible.push("account statement handoff");

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
