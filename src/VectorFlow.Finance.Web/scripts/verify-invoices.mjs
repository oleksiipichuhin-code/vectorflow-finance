/**
 * Browser verification for Invoices workflow i18n adoption.
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
  draftInvoiceId: "",
  issuedInvoiceId: "",
  issuedDueDateUtc: "",
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

/**
 * The domain rejects issuing an invoice whose due date is before the issue
 * calendar date, so the collections queue is seeded with a due-today invoice.
 */
function todayDueUtcIso() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function futureDueUtcIso() {
  return "2030-01-15T00:00:00.000Z";
}

async function seed() {
  const workspace = await apiJson("/api/finance-workspaces", {
    method: "POST",
    body: JSON.stringify({
      platformOrganizationId: crypto.randomUUID(),
      platformWorkspaceId: crypto.randomUUID(),
      name: "Invoices i18n browser verify",
      defaultCurrency: "UAH"
    })
  });
  const ws = workspace.id;

  const draft = await apiJson(`/api/finance-workspaces/${ws}/invoices`, {
    method: "POST",
    body: JSON.stringify({
      documentNumber: "INV-I18N-DRAFT",
      counterpartyReference: "ACME-CORP",
      currency: "UAH"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${draft.id}/lines`, {
    method: "POST",
    body: JSON.stringify({ quantity: 2, unitPrice: 125, description: "Consulting draft" })
  });
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${draft.id}/set-due-date`, {
    method: "POST",
    body: JSON.stringify({ dueDateUtc: futureDueUtcIso() })
  });

  const issuedSource = await apiJson(`/api/finance-workspaces/${ws}/invoices`, {
    method: "POST",
    body: JSON.stringify({
      documentNumber: "INV-I18N-ISSUED",
      counterpartyReference: "GLOBEX-LLC",
      currency: "UAH"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${issuedSource.id}/lines`, {
    method: "POST",
    body: JSON.stringify({ quantity: 1, unitPrice: 480, description: "Support retainer" })
  });

  const dueDateUtc = todayDueUtcIso();
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${issuedSource.id}/set-due-date`, {
    method: "POST",
    body: JSON.stringify({ dueDateUtc })
  });
  const issued = await apiJson(
    `/api/finance-workspaces/${ws}/invoices/${issuedSource.id}/issue`,
    { method: "POST" }
  );

  return {
    workspaceId: ws,
    draftInvoiceId: draft.id,
    issuedInvoiceId: issued.id,
    issuedDueDateUtc: dueDateUtc
  };
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.draftInvoiceId = seeded.draftInvoiceId;
  result.issuedInvoiceId = seeded.issuedInvoiceId;
  result.issuedDueDateUtc = seeded.issuedDueDateUtc;

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

  const invoicesPanel = page
    .locator("section.panel")
    .filter({ has: page.locator("#invoices-heading") });
  const detailPanel = page
    .locator("section.panel")
    .filter({ has: page.locator("#invoice-detail-heading") });

  function record(label) {
    result.expectedVisible.push(label);
    result.observedVisible.push(label);
  }

  async function assertNoRawKeys(scopeLabel) {
    const text = await page.locator("main").innerText();
    for (const prefix of [
      "invoices.",
      "invoiceStatus.",
      "collections.",
      "workbench.",
      "promise.",
      "nav.invoices"
    ]) {
      if (text.includes(prefix)) {
        throw new Error(`Raw translation key "${prefix}" visible in ${scopeLabel} UI`);
      }
    }
  }

  await page.goto(WEB, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.localStorage.removeItem("vectorflow-finance.locale");
  });

  const startUrl = `${WEB}/?view=invoices&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Ukrainian by default
  await page.locator("#invoices-heading").waitFor({ timeout: 15000 });
  const ukPanelHeading = (await page.locator("#invoices-heading").innerText()).trim();
  if (ukPanelHeading !== "Рахунки") {
    throw new Error(`Expected Ukrainian panel heading "Рахунки", got "${ukPanelHeading}"`);
  }
  await page.getByRole("heading", { level: 1, name: "Рахунки" }).waitFor({ timeout: 10000 });
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await invoicesPanel.getByText("Фільтри не застосовані.").waitFor({ timeout: 10000 });
  await invoicesPanel.getByRole("button", { name: "Створити чернетку" }).waitFor();
  await page.locator(`tr[data-row-id="${seeded.draftInvoiceId}"]`).waitFor({ timeout: 15000 });
  await page.locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`).waitFor({ timeout: 15000 });
  const ukDraftRow = await page
    .locator(`tr[data-row-id="${seeded.draftInvoiceId}"]`)
    .innerText();
  if (!ukDraftRow.includes("Чернетка")) {
    throw new Error(`Expected Ukrainian Draft status label in row, got "${ukDraftRow}"`);
  }
  await assertNoRawKeys("Ukrainian invoices list");
  record("uk invoices list with localized statuses");

  // Server-side status filter keeps the wire value in the URL
  await invoicesPanel.getByLabel("Статус").selectOption("Draft");
  await invoicesPanel.getByRole("button", { name: "Застосувати" }).click();
  await page.waitForTimeout(500);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("status=Draft")) {
    throw new Error(`Filter URL missing status=Draft: ${page.url()}`);
  }
  await page.locator(`tr[data-row-id="${seeded.draftInvoiceId}"]`).waitFor({ timeout: 10000 });
  record("uk Draft filter preserved wire value");

  await invoicesPanel.getByRole("button", { name: "Скинути", exact: true }).click();
  await page.waitForTimeout(500);

  // Real invoice detail
  await page
    .locator(`tr[data-row-id="${seeded.draftInvoiceId}"]`)
    .getByRole("button", { name: "Деталі" })
    .click();
  await page.locator("#invoice-detail-heading").waitFor({ timeout: 15000 });
  const ukDetailHeading = (await page.locator("#invoice-detail-heading").innerText()).trim();
  if (ukDetailHeading !== "Деталі рахунку") {
    throw new Error(`Expected Ukrainian detail heading, got "${ukDetailHeading}"`);
  }
  await detailPanel.getByText("Рядки", { exact: true }).waitFor({ timeout: 10000 });
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`invoiceId=${seeded.draftInvoiceId}`)) {
    throw new Error(`Detail URL missing invoiceId: ${page.url()}`);
  }
  await assertNoRawKeys("Ukrainian invoice detail");
  record("uk invoice detail loaded");

  // Collections queue chrome in Ukrainian
  await invoicesPanel.getByRole("button", { name: "Збір оплат", exact: true }).click();
  await page.waitForTimeout(700);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("queue=overdue")) {
    throw new Error(`Collections shortcut did not set queue=overdue: ${page.url()}`);
  }
  await page.getByText("Робочий простір збору оплат").waitFor({ timeout: 15000 });
  await invoicesPanel
    .getByRole("button", { name: "Робоче місце збору", exact: true })
    .waitFor({ timeout: 10000 });
  await page.locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`).waitFor({ timeout: 15000 });
  const ukQueueRow = await page
    .locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`)
    .innerText();
  if (!ukQueueRow.includes("Строк сьогодні")) {
    throw new Error(`Expected Ukrainian due-today badge in queue row, got "${ukQueueRow}"`);
  }
  if (!ukQueueRow.includes("Відкрито")) {
    throw new Error(`Expected Ukrainian open settlement badge in queue row, got "${ukQueueRow}"`);
  }
  await assertNoRawKeys("Ukrainian collections queue");
  record("uk collections queue rows and chrome");

  // Switch UA -> EN without leaving the route
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page.waitForTimeout(500);
  const enPanelHeading = (await page.locator("#invoices-heading").innerText()).trim();
  if (enPanelHeading !== "Invoices") {
    throw new Error(`Expected English panel heading "Invoices", got "${enPanelHeading}"`);
  }
  await page.getByText("Payment collection workspace").waitFor({ timeout: 10000 });
  const enQueueRow = await page
    .locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`)
    .innerText();
  if (!enQueueRow.includes("Due today")) {
    throw new Error(`Expected English due-today badge in queue row, got "${enQueueRow}"`);
  }
  if (!enQueueRow.includes("Open")) {
    throw new Error(`Expected English open settlement badge in queue row, got "${enQueueRow}"`);
  }
  // Collections shortcut clears invoiceId; reopen issued invoice for English detail chrome.
  await page
    .locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`)
    .getByRole("button", { name: "Details" })
    .click();
  await page.locator("#invoice-detail-heading").waitFor({ timeout: 15000 });
  const enDetailHeading = (await page.locator("#invoice-detail-heading").innerText()).trim();
  if (enDetailHeading !== "Invoice details") {
    throw new Error(`Expected English detail heading, got "${enDetailHeading}"`);
  }
  await detailPanel.getByText("Lines", { exact: true }).waitFor({ timeout: 10000 });
  if (!page.url().includes(`invoiceId=${seeded.issuedInvoiceId}`)) {
    throw new Error(`English detail URL missing issued invoiceId: ${page.url()}`);
  }
  if (!page.url().includes("queue=overdue")) {
    throw new Error(`Opening detail left collections queue: ${page.url()}`);
  }
  // Language switch itself must not rewrite discovery params.
  const afterSwitch = new URL(page.url());
  const before = new URL(beforeSwitch);
  if (
    afterSwitch.searchParams.get("view") !== before.searchParams.get("view") ||
    afterSwitch.searchParams.get("workspaceId") !== before.searchParams.get("workspaceId") ||
    afterSwitch.searchParams.get("queue") !== before.searchParams.get("queue") ||
    afterSwitch.searchParams.get("status") !== before.searchParams.get("status")
  ) {
    throw new Error(`Language switch changed discovery URL: ${beforeSwitch} -> ${page.url()}`);
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
  await assertNoRawKeys("English invoices");
  record("en switch preserved route and selection");

  // English list chrome after leaving the queue
  await invoicesPanel.getByRole("button", { name: "Clear queue" }).click();
  await page.waitForTimeout(600);
  await invoicesPanel.getByRole("button", { name: "Refresh" }).click();
  await page.locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`).waitFor({ timeout: 15000 });
  const enIssuedRow = await page
    .locator(`tr[data-row-id="${seeded.issuedInvoiceId}"]`)
    .innerText();
  if (!enIssuedRow.includes("Issued")) {
    throw new Error(`Expected English Issued status label in row, got "${enIssuedRow}"`);
  }
  await invoicesPanel.getByRole("button", { name: "Create draft" }).waitFor();
  record("en invoices list refreshed");

  // Dashboard card uses the localized nav label and copy
  await page.goto(`${WEB}/?view=dashboard&workspaceId=${seeded.workspaceId}`, {
    waitUntil: "networkidle"
  });
  // Count copy replaces the static card blurb once the workspace summary loads.
  await page.getByText(/invoices? in the workspace/i).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Draft invoices", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Issued invoices", exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Payment collection", exact: true }).first().waitFor();
  record("en dashboard invoices card");

  // Deep link + reload keeps English
  const detailUrl = `${WEB}/?view=invoices&workspaceId=${seeded.workspaceId}&invoiceId=${seeded.draftInvoiceId}`;
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  await page.locator("#invoice-detail-heading").waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#invoice-detail-heading").waitFor({ timeout: 15000 });
  const enAfterReload = (await page.locator("#invoices-heading").innerText()).trim();
  if (enAfterReload !== "Invoices") {
    throw new Error(`English did not survive reload: got "${enAfterReload}"`);
  }
  const storedAfterReload = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedAfterReload !== "en") {
    throw new Error(`English did not persist across reload: ${storedAfterReload}`);
  }
  record("en persisted across reload");

  // Switch back to Ukrainian and reload
  await page.getByRole("button", { name: "Ukrainian" }).click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#invoices-heading").waitFor({ timeout: 15000 });
  const ukAfterReload = (await page.locator("#invoices-heading").innerText()).trim();
  if (ukAfterReload !== "Рахунки") {
    throw new Error(`Ukrainian did not survive reload: got "${ukAfterReload}"`);
  }
  const ukDetailAfterReload = (
    await page.locator("#invoice-detail-heading").innerText()
  ).trim();
  if (ukDetailAfterReload !== "Деталі рахунку") {
    throw new Error(`Ukrainian detail heading lost after reload: "${ukDetailAfterReload}"`);
  }
  const storedUk = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedUk !== "uk") {
    throw new Error(`Ukrainian did not persist across reload: ${storedUk}`);
  }
  await assertNoRawKeys("Ukrainian after reload");
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=invoices")) {
    throw new Error(`Reload lost invoices view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`invoiceId=${seeded.draftInvoiceId}`)) {
    throw new Error(`Reload lost invoiceId: ${result.finalReloadUrl}`);
  }
  record("uk persisted across reload with detail");

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
