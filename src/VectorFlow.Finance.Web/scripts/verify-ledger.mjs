/**
 * Browser verification for Ledger postings workspace workflow.
 * Seeds via Finance API, then walks the real Vite shell with Playwright Chromium.
 */
import { chromium } from "playwright";

const API = process.env.VITE_FINANCE_API_BASE_URL || "http://localhost:5080";
const WEB = process.env.FINANCE_WEB_URL || "http://127.0.0.1:5173";

const result = {
  startUrl: "",
  intermediateUrls: [],
  finalReloadUrl: "",
  ledgerPostingId: "",
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
      name: "Ledger browser verify",
      defaultCurrency: "UAH"
    })
  });
  const ws = workspace.id;
  const cash = await apiJson(`/api/finance-workspaces/${ws}/accounts`, {
    method: "POST",
    body: JSON.stringify({ code: "1010", name: "Cash", type: "Asset" })
  });
  const revenue = await apiJson(`/api/finance-workspaces/${ws}/accounts`, {
    method: "POST",
    body: JSON.stringify({ code: "4010", name: "Revenue", type: "Revenue" })
  });
  const journal = await apiJson(`/api/finance-workspaces/${ws}/journal-entries`, {
    method: "POST",
    body: JSON.stringify({ name: "Verify ledger posting" })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: cash.id,
      debit: 250,
      credit: 0,
      description: "Cash debit"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/lines`, {
    method: "POST",
    body: JSON.stringify({
      financialAccountId: revenue.id,
      debit: 0,
      credit: 250,
      description: "Revenue credit"
    })
  });
  await apiJson(`/api/finance-workspaces/${ws}/journal-entries/${journal.id}/post`, {
    method: "POST",
    body: "{}"
  });
  const posting = await apiJson(`/api/finance-workspaces/${ws}/ledger/post`, {
    method: "POST",
    body: JSON.stringify({ journalEntryId: journal.id })
  });
  return {
    workspaceId: ws,
    journalEntryId: journal.id,
    ledgerPostingId: posting.id,
    accountId: cash.id,
    postedAtUtc: posting.postedAtUtc
  };
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const seeded = await seed();
  result.workspaceId = seeded.workspaceId;
  result.journalEntryId = seeded.journalEntryId;
  result.ledgerPostingId = seeded.ledgerPostingId;
  result.accountId = seeded.accountId;

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

  const startUrl = `${WEB}/?view=ledger&workspaceId=${seeded.workspaceId}`;
  result.startUrl = startUrl;
  await page.goto(startUrl, { waitUntil: "networkidle" });

  await page.getByRole("heading", { name: "Ledger", exact: true }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "Ledger postings" }).waitFor();
  await page.locator(`tr[data-row-id="${seeded.ledgerPostingId}"]`).waitFor({ timeout: 15000 });
  result.observedVisible.push("ledger list row present");
  result.expectedVisible.push("ledger list row present");

  // Apply posted date filter (today)
  const day = todayUtcDate();
  await page.locator('input[type="date"]').nth(0).fill(day);
  await page.locator('input[type="date"]').nth(1).fill(day);
  await page.getByRole("button", { name: "Застосувати фільтр" }).click();
  await page.waitForTimeout(400);
  result.intermediateUrls.push(page.url());
  if (!page.url().includes("postedFrom=") || !page.url().includes("postedTo=")) {
    throw new Error(`Filter URL missing posted dates: ${page.url()}`);
  }
  await page.locator(`tr[data-row-id="${seeded.ledgerPostingId}"]`).waitFor();
  result.observedVisible.push("filtered list still shows posting");
  result.expectedVisible.push("filtered list still shows posting");

  // Open detail
  await page
    .locator(`tr[data-row-id="${seeded.ledgerPostingId}"]`)
    .getByRole("button", { name: "Відкрити" })
    .click();
  await page.getByText("Ledger posting завантажено з API.").waitFor({ timeout: 10000 });
  await page.getByRole("heading", { name: "Деталі ledger posting" }).waitFor();
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`ledgerPostingId=${seeded.ledgerPostingId}`)) {
    throw new Error(`Detail URL missing ledgerPostingId: ${page.url()}`);
  }
  result.observedVisible.push("detail success from API");
  result.expectedVisible.push("detail success from API");

  // Refresh from API (meaningful action confirming persistence)
  await page.getByRole("button", { name: "Оновити з API" }).click();
  await page.getByText("Ledger posting завантажено з API.").waitFor({ timeout: 10000 });
  result.observedVisible.push("refresh from API succeeded");
  result.expectedVisible.push("refresh from API succeeded");

  // Related-record handoff: journal entry
  await page.getByRole("button", { name: "Journal entry", exact: true }).click();
  await page.waitForURL(/view=journals/, { timeout: 10000 });
  result.intermediateUrls.push(page.url());
  if (!page.url().includes(`journalEntryId=${seeded.journalEntryId}`)) {
    throw new Error(`Journal handoff URL missing journalEntryId: ${page.url()}`);
  }
  result.observedVisible.push("journal handoff");
  result.expectedVisible.push("journal handoff");

  // Return to ledger with filters + detail
  const returnUrl = `${WEB}/?view=ledger&workspaceId=${seeded.workspaceId}&postedFrom=${day}&postedTo=${day}&ledgerPostingId=${seeded.ledgerPostingId}`;
  await page.goto(returnUrl, { waitUntil: "networkidle" });
  await page.getByText("Ledger posting завантажено з API.").waitFor({ timeout: 15000 });
  result.observedVisible.push("return restored detail");
  result.expectedVisible.push("return restored detail");

  // Account statement handoff from line (scoped to detail panel, not app nav)
  await page
    .locator("section.panel")
    .filter({ has: page.locator("#ledger-detail-heading") })
    .getByRole("button", { name: "Account statement" })
    .first()
    .click();
  await page.waitForURL(
    new RegExp(`view=account-statement.*accountId=${seeded.accountId}`),
    { timeout: 10000 }
  );
  result.intermediateUrls.push(page.url());
  result.observedVisible.push("account statement handoff");
  result.expectedVisible.push("account statement handoff");

  // Back to ledger deep link and reload
  await page.goto(returnUrl, { waitUntil: "networkidle" });
  await page.getByText("Ledger posting завантажено з API.").waitFor({ timeout: 15000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Ledger posting завантажено з API.").waitFor({ timeout: 15000 });
  await page.locator(`tr[data-row-id="${seeded.ledgerPostingId}"]`).waitFor();
  result.finalReloadUrl = page.url();
  if (!result.finalReloadUrl.includes("view=ledger")) {
    throw new Error(`Reload lost ledger view: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`ledgerPostingId=${seeded.ledgerPostingId}`)) {
    throw new Error(`Reload lost ledgerPostingId: ${result.finalReloadUrl}`);
  }
  if (!result.finalReloadUrl.includes(`postedFrom=${day}`)) {
    throw new Error(`Reload lost postedFrom: ${result.finalReloadUrl}`);
  }
  result.observedVisible.push("reload restored URL state and server detail");
  result.expectedVisible.push("reload restored URL state and server detail");

  // Ignore benign favicon / aborted in-flight navigations
  result.failedRequests = result.failedRequests.filter(
    (line) => !line.includes("favicon") && !line.includes("ERR_ABORTED")
  );
  result.httpFailures = result.httpFailures.filter(
    (line) => !line.includes("favicon")
  );

  if (result.consoleErrors.length || result.pageErrors.length || result.failedRequests.length || result.httpFailures.length) {
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
