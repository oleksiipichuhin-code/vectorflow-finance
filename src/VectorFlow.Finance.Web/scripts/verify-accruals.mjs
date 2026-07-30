/**
 * Browser verification for Accruals workflow i18n adoption.
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
  sourceInvoiceId: "",
  recognizeAccrualId: "",
  linkedAccrualId: "",
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

function recognitionDateUtcIso() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

async function seed() {
  const workspace = await apiJson("/api/finance-workspaces", {
    method: "POST",
    body: JSON.stringify({
      platformOrganizationId: crypto.randomUUID(),
      platformWorkspaceId: crypto.randomUUID(),
      name: "Accruals i18n browser verify",
      defaultCurrency: "UAH"
    })
  });
  const ws = workspace.id;

  // Real invoice so the source-invoice column and picker have authoritative data.
  const invoice = await apiJson(`/api/finance-workspaces/${ws}/invoices`, {
    method: "POST",
    body: JSON.stringify({
      documentNumber: "INV-ACCR-I18N",
      counterpartyReference: "ACME-CORP",
      currency: "UAH"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/invoices/${invoice.id}/lines`, {
    method: "POST",
    body: JSON.stringify({ quantity: 1, unitPrice: 640, description: "Retainer" })
  });

  const recognitionDateUtc = recognitionDateUtcIso();

  // Draft revenue accrual used for the safe recognize lifecycle step.
  const recognizeTarget = await apiJson(`/api/finance-workspaces/${ws}/accruals`, {
    method: "POST",
    body: JSON.stringify({
      type: "Revenue",
      amount: 250.5,
      currency: "UAH",
      recognitionDateUtc,
      description: "Accrual i18n recognize target",
      sourceInvoiceId: null
    })
  });

  // Draft expense accrual linked to the invoice; stays Draft for editor chrome.
  const linked = await apiJson(`/api/finance-workspaces/${ws}/accruals`, {
    method: "POST",
    body: JSON.stringify({
      type: "Expense",
      amount: 99.99,
      currency: "UAH",
      recognitionDateUtc,
      description: "Accrual i18n linked draft",
      sourceInvoiceId: invoice.id
    })
  });

  return {
    workspaceId: ws,
    sourceInvoiceId: invoice.id,
    recognizeAccrualId: recognizeTarget.id,
    linkedAccrualId: linked.id
  };
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.sourceInvoiceId = seeded.sourceInvoiceId;
  result.recognizeAccrualId = seeded.recognizeAccrualId;
  result.linkedAccrualId = seeded.linkedAccrualId;

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

  const accrualsPanel = page
    .locator("section.panel")
    .filter({ has: page.locator("#accruals-heading") });
  const detailPanel = page.locator("section.accrual-detail-panel");
  const recognizeRow = page.locator(`tr[data-row-id="${seeded.recognizeAccrualId}"]`);
  const linkedRow = page.locator(`tr[data-row-id="${seeded.linkedAccrualId}"]`);

  function record(label) {
    result.expectedVisible.push(label);
    result.observedVisible.push(label);
  }

  async function assertNoRawKeys(scopeLabel) {
    const text = await page.locator("main").innerText();
    for (const prefix of [
      "accruals.",
      "accrualStatus.",
      "nav.accruals",
      "type.Revenue",
      "type.Expense",
      "workspaceSummary.",
      "dashboard.accruals"
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

  const startUrl = `${WEB}/?view=accruals&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  // Ukrainian by default
  await page.locator("#accruals-heading").waitFor({ timeout: 15000 });
  const ukPanelHeading = (await page.locator("#accruals-heading").innerText()).trim();
  if (ukPanelHeading !== "Нарахування") {
    throw new Error(
      `Expected Ukrainian panel heading "Нарахування", got "${ukPanelHeading}"`
    );
  }
  await page
    .getByRole("heading", { level: 1, name: "Нарахування" })
    .waitFor({ timeout: 10000 });
  const htmlLang = await page.locator("html").getAttribute("lang");
  if (htmlLang !== "uk") {
    throw new Error(`Expected html lang=uk, got ${htmlLang}`);
  }
  await accrualsPanel.getByText("Фільтри не застосовані.").waitFor({ timeout: 10000 });
  await accrualsPanel.getByRole("button", { name: "Створити чернетку" }).waitFor();
  await recognizeRow.waitFor({ timeout: 15000 });
  await linkedRow.waitFor({ timeout: 15000 });

  const ukRevenueRow = await recognizeRow.innerText();
  if (!ukRevenueRow.includes("Чернетка")) {
    throw new Error(`Expected Ukrainian Draft status label in row, got "${ukRevenueRow}"`);
  }
  if (!ukRevenueRow.includes("Дохід")) {
    throw new Error(`Expected Ukrainian Revenue type label in row, got "${ukRevenueRow}"`);
  }
  const ukExpenseRow = await linkedRow.innerText();
  if (!ukExpenseRow.includes("Витрата")) {
    throw new Error(`Expected Ukrainian Expense type label in row, got "${ukExpenseRow}"`);
  }
  // The list renders the linked-invoice placeholder until a picker caches the summary.
  if (!ukExpenseRow.includes("Вибрано")) {
    throw new Error(`Expected Ukrainian linked-invoice cell label, got "${ukExpenseRow}"`);
  }
  await assertNoRawKeys("Ukrainian accruals list");
  record("uk accruals list with localized statuses and types");

  // Server-side status filter keeps the wire value in the URL
  await accrualsPanel.getByLabel("Статус").selectOption("Draft");
  await accrualsPanel.getByRole("button", { name: "Застосувати" }).click();
  await page.waitForTimeout(600);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("status=Draft")) {
    throw new Error(`Filter URL missing status=Draft: ${page.url()}`);
  }
  await accrualsPanel.getByText("статус Чернетка").waitFor({ timeout: 10000 });
  await recognizeRow.waitFor({ timeout: 10000 });
  record("uk Draft filter preserved wire value");

  await accrualsPanel.getByRole("button", { name: "Скинути", exact: true }).click();
  await page.waitForTimeout(600);

  // Real accrual detail
  await recognizeRow.getByRole("button", { name: "Деталі" }).click();
  await page.locator("#accrual-detail-heading").waitFor({ timeout: 15000 });
  const ukDetailHeading = (await page.locator("#accrual-detail-heading").innerText()).trim();
  if (ukDetailHeading !== "Деталі нарахування") {
    throw new Error(`Expected Ukrainian detail heading, got "${ukDetailHeading}"`);
  }
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`accrualId=${seeded.recognizeAccrualId}`)) {
    throw new Error(`Detail URL missing accrualId: ${page.url()}`);
  }
  const ukDetailText = await detailPanel.innerText();
  for (const label of ["Статус", "Тип", "Сума", "Дата визнання", "Рахунок-джерело", "Дії"]) {
    if (!ukDetailText.includes(label)) {
      throw new Error(`Expected Ukrainian detail label "${label}" in panel`);
    }
  }
  if (!ukDetailText.includes("Чернетка") || !ukDetailText.includes("Дохід")) {
    throw new Error(`Expected localized detail status/type, got "${ukDetailText}"`);
  }
  if (!ukDetailText.includes("Не вибрано")) {
    throw new Error(`Expected Ukrainian no-selection source invoice, got "${ukDetailText}"`);
  }
  await assertNoRawKeys("Ukrainian accrual detail");
  record("uk accrual detail loaded with localized fields");

  // Safe lifecycle: recognize the Draft accrual from the detail panel
  await detailPanel.getByRole("button", { name: "Визнати", exact: true }).click();
  await page.getByText(/визнано\. Статус: Визнано/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  const ukRecognizedRow = await recognizeRow.innerText();
  if (!ukRecognizedRow.includes("Визнано")) {
    throw new Error(`Expected Ukrainian Recognized status in row, got "${ukRecognizedRow}"`);
  }
  const ukRecognizedDetail = await detailPanel.innerText();
  if (!ukRecognizedDetail.includes("Сторнувати")) {
    throw new Error(
      `Expected Ukrainian reverse action after recognize, got "${ukRecognizedDetail}"`
    );
  }
  await assertNoRawKeys("Ukrainian accrual after recognize");
  record("uk recognize lifecycle localized end to end");

  // Switch UA -> EN without leaving the route
  const beforeSwitch = page.url();
  await page.getByRole("button", { name: "English" }).click();
  await page.waitForTimeout(600);
  const enPanelHeading = (await page.locator("#accruals-heading").innerText()).trim();
  if (enPanelHeading !== "Accruals") {
    throw new Error(`Expected English panel heading "Accruals", got "${enPanelHeading}"`);
  }
  const enDetailHeading = (await page.locator("#accrual-detail-heading").innerText()).trim();
  if (enDetailHeading !== "Accrual details") {
    throw new Error(`Expected English detail heading, got "${enDetailHeading}"`);
  }
  const enRecognizedRow = await recognizeRow.innerText();
  if (!enRecognizedRow.includes("Recognized") || !enRecognizedRow.includes("Revenue")) {
    throw new Error(`Expected English status/type labels in row, got "${enRecognizedRow}"`);
  }
  const enLinkedRow = await linkedRow.innerText();
  if (!enLinkedRow.includes("Draft") || !enLinkedRow.includes("Expense")) {
    throw new Error(`Expected English Draft/Expense labels in row, got "${enLinkedRow}"`);
  }
  if (!enLinkedRow.includes("Selected")) {
    throw new Error(`Expected English linked-invoice cell label, got "${enLinkedRow}"`);
  }
  await accrualsPanel.getByRole("button", { name: "Create draft" }).waitFor({ timeout: 10000 });

  // Language switch itself must not rewrite discovery params.
  const afterSwitch = new URL(page.url());
  const before = new URL(beforeSwitch);
  for (const param of ["view", "workspaceId", "accrualId", "status", "page"]) {
    if (afterSwitch.searchParams.get(param) !== before.searchParams.get(param)) {
      throw new Error(
        `Language switch changed discovery param ${param}: ${beforeSwitch} -> ${page.url()}`
      );
    }
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
  await assertNoRawKeys("English accruals");
  record("en switch preserved route and detail selection");

  // English Draft editors chrome for the linked accrual
  await linkedRow.getByRole("button", { name: "Change amount" }).click();
  await page.getByLabel("New accrual amount").waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await page.waitForTimeout(300);
  record("en amount editor chrome localized");

  // Dashboard card uses the localized nav label and count copy
  await page.goto(`${WEB}/?view=dashboard&workspaceId=${seeded.workspaceId}`, {
    waitUntil: "networkidle"
  });
  await page.getByText(/accruals? in the workspace/i).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Accruals", exact: true }).first().waitFor();
  await assertNoRawKeys("English dashboard accruals card");
  record("en dashboard accruals card and metric");

  // Deep link + reload keeps English
  const detailUrl = `${WEB}/?view=accruals&workspaceId=${seeded.workspaceId}&accrualId=${seeded.recognizeAccrualId}`;
  await page.goto(detailUrl, { waitUntil: "networkidle" });
  await page.locator("#accrual-detail-heading").waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#accrual-detail-heading").waitFor({ timeout: 15000 });
  const enAfterReload = (await page.locator("#accruals-heading").innerText()).trim();
  if (enAfterReload !== "Accruals") {
    throw new Error(`English did not survive reload: got "${enAfterReload}"`);
  }
  const storedAfterReload = await page.evaluate(() =>
    window.localStorage.getItem("vectorflow-finance.locale")
  );
  if (storedAfterReload !== "en") {
    throw new Error(`English did not persist across reload: ${storedAfterReload}`);
  }
  record("en persisted across reload with detail deep link");

  // Switch back to Ukrainian and reload
  await page.getByRole("button", { name: "Ukrainian" }).click();
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#accruals-heading").waitFor({ timeout: 15000 });
  const ukAfterReload = (await page.locator("#accruals-heading").innerText()).trim();
  if (ukAfterReload !== "Нарахування") {
    throw new Error(`Ukrainian did not survive reload: got "${ukAfterReload}"`);
  }
  const ukDetailAfterReload = (
    await page.locator("#accrual-detail-heading").innerText()
  ).trim();
  if (ukDetailAfterReload !== "Деталі нарахування") {
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
  if (!result.finalReloadUrl.includes("view=accruals")) {
    throw new Error(`Reload lost accruals view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`accrualId=${seeded.recognizeAccrualId}`)) {
    throw new Error(`Reload lost accrualId: ${result.finalReloadUrl}`);
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
