/**
 * Browser verification for Chart of Accounts (Accounts) workflow.
 * Seeds via Finance API, then walks the real Vite shell with Playwright Chromium.
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
      name: "Accounts browser verify",
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
  const page = await browser.newPage();

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

  const startUrl = `${WEB}/?view=accounts&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "Accounts", exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "План рахунків" }).waitFor();
  await page.locator(`tr[data-row-id="${seeded.cashId}"]`).waitFor({ timeout: 15000 });
  result.observedVisible.push("accounts list row present");
  result.expectedVisible.push("accounts list row present");

  // Apply search + type filter
  await page.getByPlaceholder("Код або назва").fill("cash");
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#accounts-list-heading") })
    .getByLabel("Type")
    .selectOption("Asset");
  await page.getByRole("button", { name: "Застосувати фільтр" }).click();
  await page.waitForTimeout(400);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("accountQ=cash") || !page.url().includes("type=Asset")) {
    throw new Error(`Filter URL missing accountQ/type: ${page.url()}`);
  }
  await page.locator(`tr[data-row-id="${seeded.cashId}"]`).waitFor();
  const revenueVisible = await page.locator(`tr[data-row-id="${seeded.revenueId}"]`).count();
  if (revenueVisible !== 0) {
    throw new Error("Revenue row still visible after Asset/cash filter");
  }
  result.observedVisible.push("filtered list shows cash only");
  result.expectedVisible.push("filtered list shows cash only");

  // Open detail
  await page
    .locator(`tr[data-row-id="${seeded.cashId}"]`)
    .getByRole("button", { name: "Відкрити" })
    .click();
  await page.getByText("Рахунок завантажено з API.").waitFor({ timeout: 10000 });
  await page.getByRole("heading", { name: "Деталі рахунку" }).waitFor();
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`accountId=${seeded.cashId}`)) {
    throw new Error(`Detail URL missing accountId: ${page.url()}`);
  }
  result.observedVisible.push("detail success from API");
  result.expectedVisible.push("detail success from API");

  // Meaningful action: rename then archive
  await page.getByLabel("Rename").fill("Petty Cash");
  await page.getByRole("button", { name: "Зберегти назву" }).click();
  await page.getByText("Назву рахунку оновлено.").waitFor({ timeout: 10000 });
  result.observedVisible.push("rename persisted");
  result.expectedVisible.push("rename persisted");

  await page.getByRole("button", { name: "Archive account" }).click();
  await page.getByText("Рахунок заархівовано.").waitFor({ timeout: 10000 });
  result.archivedAccountId = seeded.cashId;
  result.observedVisible.push("archive persisted");
  result.expectedVisible.push("archive persisted");

  // Confirm list refresh shows Archived after clearing filters and applying status
  await page.getByRole("button", { name: "Скинути" }).click();
  await page.waitForTimeout(300);
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#accounts-list-heading") })
    .getByLabel("Status")
    .selectOption("Archived");
  await page.getByRole("button", { name: "Застосувати фільтр" }).click();
  await page.waitForTimeout(400);
  await page.locator(`tr[data-row-id="${seeded.cashId}"]`).waitFor();
  const statusCell = await page
    .locator(`tr[data-row-id="${seeded.cashId}"] td`)
    .nth(3)
    .innerText();
  if (statusCell.trim() !== "Archived") {
    throw new Error(`Expected Archived status in list, got: ${statusCell}`);
  }
  result.observedVisible.push("list shows archived status");
  result.expectedVisible.push("list shows archived status");

  // Related-record handoff: Account statement
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#accounts-detail-heading") })
    .getByRole("button", { name: "Account statement" })
    .click();
  await page.waitForURL(
    new RegExp(`view=account-statement.*accountId=${seeded.cashId}`),
    { timeout: 10000 }
  );
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("account statement handoff");
  result.expectedVisible.push("account statement handoff");

  // Return via deep link + reload
  const returnUrl = `${WEB}/?view=accounts&workspaceId=${seeded.workspaceId}&accountQ=cash&status=Archived&type=Asset&accountId=${seeded.cashId}`;
  await page.goto(returnUrl, { waitUntil: "networkidle" });
  await page.getByText("Рахунок завантажено з API.").waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Рахунок завантажено з API.").waitFor({ timeout: 15000 });
  await page.locator(`tr[data-row-id="${seeded.cashId}"]`).waitFor();
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=accounts")) {
    throw new Error(`Reload lost accounts view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`accountId=${seeded.cashId}`)) {
    throw new Error(`Reload lost accountId: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes("status=Archived")) {
    throw new Error(`Reload lost status filter: ${result.finalReloadUrl}`);
  }
  result.observedVisible.push("reload restored URL state and server detail");
  result.expectedVisible.push("reload restored URL state and server detail");

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
