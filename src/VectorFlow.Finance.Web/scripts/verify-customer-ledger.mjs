/**
 * Browser verification for Customer Ledger i18n adoption.
 * Seeds via Finance API, walks Ukrainian + English with Playwright Chromium.
 */
import { chromium } from "playwright";

const API = process.env.VITE_FINANCE_API_BASE_URL || "http://localhost:5080";
const WEB = process.env.FINANCE_WEB_URL || "http://127.0.0.1:5173";

const result = {
  startUrl: "",
  intermediateUrls: [],
  finalReloadUrl: "",
  workspaceId: "",
  invoiceId: "",
  counterpartyReference: "",
  accrualId: "",
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

function futureDueUtcIso() {
  return "2030-01-15T00:00:00.000Z";
}

async function seed() {
  const counterpartyReference = "ACME-CORP";
  const workspace = await apiJson("/api/finance-workspaces", {
    method: "POST",
    body: JSON.stringify({
      platformOrganizationId: crypto.randomUUID(),
      platformWorkspaceId: crypto.randomUUID(),
      name: "Customer ledger i18n browser verify",
      defaultCurrency: "UAH"
    })
  });
  const ws = workspace.id;
  const invoice = await apiJson(`/api/finance-workspaces/${ws}/invoices`, {
    method: "POST",
    body: JSON.stringify({
      documentNumber: "INV-CL-I18N",
      counterpartyReference,
      currency: "UAH"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${invoice.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      quantity: 1,
      unitPrice: 150,
      description: "Consulting"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${invoice.id}/set-due-date`, {
    method: "POST",
    body: JSON.stringify({ dueDateUtc: futureDueUtcIso() })
  });
  const issued = await apiJson(`/api/finance-workspaces/${ws}/invoices/${invoice.id}/issue`, {
    method: "POST"
  });
  return {
    workspaceId: ws,
    invoiceId: issued.id,
    counterpartyReference,
    documentNumber: issued.documentNumber
  };
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.invoiceId = seeded.invoiceId;
  result.counterpartyReference = seeded.counterpartyReference;

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

  const startUrl = `${WEB}/?view=customer-ledger&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Default Ukrainian
  await page.getByRole("heading", { name: "Книга клієнта", exact: true }).waitFor({
    timeout: 15000
  });
  await page.getByRole("heading", { name: "Контрагенти" }).waitFor();
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await page
    .locator(`tr[data-row-id="${seeded.counterpartyReference}"]`)
    .waitFor({ timeout: 15000 });
  result.observedVisible.push("uk counterparties list present");
  result.expectedVisible.push("uk counterparties list present");

  // Filter: counterparty search (aging overdue buckets would hide non-overdue Issued)
  await page.getByPlaceholder("Частина counterpartyReference").fill("ACME");
  await page.getByRole("button", { name: "Застосувати фільтр" }).click();
  await page.waitForTimeout(400);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("customerQ=ACME")) {
    throw new Error(`Filter URL missing customerQ: ${page.url()}`);
  }
  await page.locator(`tr[data-row-id="${seeded.counterpartyReference}"]`).waitFor();
  result.observedVisible.push("uk filtered list");
  result.expectedVisible.push("uk filtered list");

  // Open counterparty detail
  await page
    .locator(`tr[data-row-id="${seeded.counterpartyReference}"]`)
    .getByRole("button", { name: "Відкрити" })
    .click();
  await page
    .getByRole("heading", { name: `Книга: ${seeded.counterpartyReference}` })
    .waitFor({ timeout: 10000 });
  if (!page.url().includes(`counterpartyReference=${encodeURIComponent(seeded.counterpartyReference)}`)
    && !page.url().includes(`counterpartyReference=${seeded.counterpartyReference}`)) {
    throw new Error(`Detail URL missing counterpartyReference: ${page.url()}`);
  }
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("uk counterparty detail");
  result.expectedVisible.push("uk counterparty detail");

  // Open invoice item details
  await page
    .locator(`tr[data-row-id="${seeded.invoiceId}"]`)
    .getByRole("button", { name: "Деталі" })
    .click();
  await page.getByRole("heading", { name: "Позиція customer ledger" }).waitFor({
    timeout: 10000
  });
  if (!page.url().includes(`invoiceId=${seeded.invoiceId}`)) {
    throw new Error(`Invoice detail URL missing invoiceId: ${page.url()}`);
  }
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("uk invoice detail");
  result.expectedVisible.push("uk invoice detail");

  // Meaningful action: create accrual
  await page.getByRole("button", { name: "Створити нарахування" }).click();
  await page.getByLabel("Опис нарахування").fill("CL i18n accrual");
  await page
    .locator("form.create-form")
    .getByRole("button", { name: "Створити нарахування" })
    .click();
  await page.getByText(/Створено нарахування/).waitFor({ timeout: 15000 });
  const accrualRowId = await page
    .locator("section.panel")
    .filter({ has: page.locator("#customer-ledger-invoice-heading") })
    .locator("tbody tr[data-row-id]")
    .first()
    .getAttribute("data-row-id");
  if (!accrualRowId) {
    throw new Error("Created accrual row not found");
  }
  result.accrualId = accrualRowId;
  result.observedVisible.push("uk create accrual persisted");
  result.expectedVisible.push("uk create accrual persisted");

  // Switch to English without leaving route/selection
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("heading", { name: "Customer ledger", exact: true }).waitFor({
    timeout: 10000
  });
  await page.getByText(/Created accrual/).waitFor({ timeout: 10000 });
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

  // Related-record handoff: open in Invoices
  await page.getByRole("button", { name: "Open in Invoices" }).click();
  await page.waitForURL(/view=invoices/, { timeout: 10000 });
  if (!page.url().includes(`invoiceId=${seeded.invoiceId}`)) {
    throw new Error(`Invoice handoff URL missing invoiceId: ${page.url()}`);
  }
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("invoice handoff");
  result.expectedVisible.push("invoice handoff");

  // Return to customer ledger deep link
  const returnUrl = `${WEB}/?view=customer-ledger&workspaceId=${seeded.workspaceId}&customerQ=ACME&counterpartyReference=${encodeURIComponent(seeded.counterpartyReference)}&invoiceId=${seeded.invoiceId}`;
  await page.goto(returnUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Customer ledger", exact: true }).waitFor({
    timeout: 15000
  });
  await page.getByRole("heading", { name: "Customer ledger item" }).waitFor({ timeout: 10000 });
  await page.locator(`tr[data-row-id="${result.accrualId}"]`).waitFor({ timeout: 15000 });
  result.observedVisible.push("return restored detail in English");
  result.expectedVisible.push("return restored detail in English");

  // Accrual handoff
  await page
    .locator(`tr[data-row-id="${result.accrualId}"]`)
    .getByRole("button", { name: "Accrual" })
    .click();
  await page.waitForURL(/view=accruals/, { timeout: 15000 });
  if (!page.url().includes(`accrualId=${result.accrualId}`)) {
    throw new Error(`Accrual handoff URL missing accrualId: ${page.url()}`);
  }
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("accrual handoff");
  result.expectedVisible.push("accrual handoff");

  // Back to customer ledger and reload — English persists
  await page.goto(returnUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Customer ledger", exact: true }).waitFor({
    timeout: 15000
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Customer ledger", exact: true }).waitFor({
    timeout: 15000
  });
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
  await page.getByRole("heading", { name: "Книга клієнта", exact: true }).waitFor({
    timeout: 10000
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Книга клієнта", exact: true }).waitFor({
    timeout: 15000
  });
  await page
    .locator(`tr[data-row-id="${seeded.counterpartyReference}"]`)
    .waitFor({ timeout: 15000 });
  const storedUk = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedUk !== "uk") {
    throw new Error(`Ukrainian did not persist across reload: ${storedUk}`);
  }
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=customer-ledger")) {
    throw new Error(`Reload lost customer-ledger view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`invoiceId=${seeded.invoiceId}`)) {
    throw new Error(`Reload lost invoiceId: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes("customerQ=ACME")) {
    throw new Error(`Reload lost customerQ: ${result.finalReloadUrl}`);
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
