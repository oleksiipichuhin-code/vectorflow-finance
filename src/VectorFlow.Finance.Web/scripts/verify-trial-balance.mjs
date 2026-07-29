/**
 * Browser verification for Trial Balance i18n adoption.
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
  cashAccountId: "",
  revenueAccountId: "",
  workspaceId: "",
  totalDebit: 0,
  totalCredit: 0,
  isBalanced: false,
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
      name: "Trial balance i18n browser verify",
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
    body: JSON.stringify({ name: "Verify trial balance" })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: cash.id,
      debit: 750,
      credit: 0,
      description: "Cash debit"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: revenue.id,
      debit: 0,
      credit: 750,
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
  const trial = await apiJson(`/api/finance-workspaces/${ws}/trial-balance`);
  return {
    workspaceId: ws,
    journalEntryId: journal.id,
    cashAccountId: cash.id,
    revenueAccountId: revenue.id,
    totalDebit: trial.totalDebit,
    totalCredit: trial.totalCredit,
    isBalanced: trial.isBalanced
  };
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.journalEntryId = seeded.journalEntryId;
  result.cashAccountId = seeded.cashAccountId;
  result.revenueAccountId = seeded.revenueAccountId;
  result.totalDebit = seeded.totalDebit;
  result.totalCredit = seeded.totalCredit;
  result.isBalanced = seeded.isBalanced;

  if (!seeded.isBalanced || seeded.totalDebit !== 750 || seeded.totalCredit !== 750) {
    throw new Error(
      `Unexpected API trial balance: balanced=${seeded.isBalanced} D=${seeded.totalDebit} C=${seeded.totalCredit}`
    );
  }

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

  const startUrl = `${WEB}/?view=trial-balance&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Default Ukrainian (hero h1 + panel h2 share title)
  await page
    .getByRole("heading", { name: "Оборотно-сальдова відомість", exact: true })
    .first()
    .waitFor({ timeout: 15000 });
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await page.getByText("Збалансовано", { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText("Разом дебет", { exact: true }).waitFor();
  await page.getByText("Разом кредит", { exact: true }).waitFor();
  await page.locator(`tr[data-row-id="${seeded.cashAccountId}"]`).waitFor();
  await page.locator(`tr[data-row-id="${seeded.revenueAccountId}"]`).waitFor();

  // Balance-side localized labels on rows
  const cashSide = await page
    .locator(`tr[data-row-id="${seeded.cashAccountId}"]`)
    .locator("td")
    .nth(5)
    .innerText();
  const revenueSide = await page
    .locator(`tr[data-row-id="${seeded.revenueAccountId}"]`)
    .locator("td")
    .nth(5)
    .innerText();
  if (cashSide.trim() !== "Дебет") {
    throw new Error(`Expected cash side Дебет, got ${cashSide}`);
  }
  if (revenueSide.trim() !== "Кредит") {
    throw new Error(`Expected revenue side Кредит, got ${revenueSide}`);
  }
  result.observedVisible.push("uk balanced trial balance with localized sides");
  result.expectedVisible.push("uk balanced trial balance with localized sides");

  // Refresh
  await page.getByRole("button", { name: "Оновити" }).click();
  await page.getByText("Збалансовано", { exact: true }).waitFor({ timeout: 10000 });
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("uk refresh succeeded");
  result.expectedVisible.push("uk refresh succeeded");

  // Switch to English without leaving route
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page
    .getByRole("heading", { name: "Trial balance", exact: true })
    .first()
    .waitFor({ timeout: 10000 });
  await page.getByText("Balanced", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByText("Total debit", { exact: true }).waitFor();
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
  const cashSideEn = await page
    .locator(`tr[data-row-id="${seeded.cashAccountId}"]`)
    .locator("td")
    .nth(5)
    .innerText();
  if (cashSideEn.trim() !== "Debit") {
    throw new Error(`Expected cash side Debit in EN, got ${cashSideEn}`);
  }
  result.observedVisible.push("en switch preserved route");
  result.expectedVisible.push("en switch preserved route");

  // Refresh in English
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.getByText("Balanced", { exact: true }).waitFor({ timeout: 10000 });
  result.observedVisible.push("en refresh succeeded");
  result.expectedVisible.push("en refresh succeeded");

  // Reload — English persists
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Trial balance", exact: true })
    .first()
    .waitFor({ timeout: 15000 });
  await page.getByText("Balanced", { exact: true }).waitFor({ timeout: 15000 });
  const storedAfterReload = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedAfterReload !== "en") {
    throw new Error(`English did not persist across reload: ${storedAfterReload}`);
  }
  if (!page.url().includes("view=trial-balance")) {
    throw new Error(`Reload lost trial-balance view: ${page.url()}`);
  }
  if (!page.url().includes(`workspaceId=${seeded.workspaceId}`)) {
    throw new Error(`Reload lost workspaceId: ${page.url()}`);
  }
  result.observedVisible.push("en persisted across reload");
  result.expectedVisible.push("en persisted across reload");

  // Switch back to Ukrainian and reload
  await page.getByRole("button", { name: "Ukrainian" }).click();
  await page
    .getByRole("heading", { name: "Оборотно-сальдова відомість", exact: true })
    .first()
    .waitFor({ timeout: 10000 });
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Оборотно-сальдова відомість", exact: true })
    .first()
    .waitFor({ timeout: 15000 });
  await page.getByText("Збалансовано", { exact: true }).waitFor({ timeout: 15000 });
  await page.locator(`tr[data-row-id="${seeded.cashAccountId}"]`).waitFor();
  const storedUk = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedUk !== "uk") {
    throw new Error(`Ukrainian did not persist across reload: ${storedUk}`);
  }
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=trial-balance")) {
    throw new Error(`Reload lost trial-balance view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`workspaceId=${seeded.workspaceId}`)) {
    throw new Error(`Reload lost workspaceId: ${result.finalReloadUrl}`);
  }
  result.observedVisible.push("uk persisted across reload");
  result.expectedVisible.push("uk persisted across reload");

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
