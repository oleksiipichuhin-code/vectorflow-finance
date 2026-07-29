# VectorFlow Finance

VectorFlow Finance is a separate financial product in the VectorFlow ecosystem. It owns finance workspaces, financial accounts, documents, payments, allocations, cash-flow planning, and an immutable financial ledger.

This repository currently contains **F0 — Product and Architecture Foundation** and **F1A — FinanceWorkspace Domain Foundation** (published). F1 remains in progress through later sub-slices.

## Solution layout

| Path | Role |
|------|------|
| `src/VectorFlow.Finance.Domain` | Domain value types, aggregates, and rules |
| `src/VectorFlow.Finance.Application` | Application services |
| `src/VectorFlow.Finance.Infrastructure` | Composition and infrastructure adapters |
| `src/VectorFlow.Finance.Api` | HTTP composition root |
| `src/VectorFlow.Finance.Contracts` | Public transport/integration contracts |
| `src/VectorFlow.Finance.Web` | React + Vite frontend shell |
| `tests/*` | Automated tests by layer |

Solution file: `VectorFlow.Finance.slnx`

Domain workspace model details: `docs/architecture/FinanceWorkspace.md`

## Prerequisites

- .NET SDK 10.x
- Node.js 20+ and npm

## Backend

```powershell
dotnet restore
dotnet build
dotnet test
dotnet run --project src/VectorFlow.Finance.Api
```

Local Development URL: `http://localhost:5080` (see `Properties/launchSettings.json`).

Swagger UI (Development): `http://localhost:5080/swagger`

Health endpoint:

```text
GET /health
```

Expected payload:

```json
{
  "product": "VectorFlow Finance API",
  "status": "Healthy",
  "phase": "F0"
}
```

In Development, the API allows CORS from the Vite web origin (`http://localhost:5173` and `http://127.0.0.1:5173`).

## Frontend

```powershell
Set-Location src/VectorFlow.Finance.Web
npm install
npm run dev
```

Local Development URL: `http://localhost:5173`

`VITE_FINANCE_API_BASE_URL` points the browser shell at the real Finance API (`http://localhost:5080` by default in Development; see `.env.example`). Primary UI language is Ukrainian.

The shell navigates Workspace → Dashboard → Invoices → Accruals → Journals → Accounts → Ledger → Trial balance → Account statement → Customer ledger against the running backend (not mocks). Invoices and Accruals support apply/clear filters and pagination (fixed page size 5). Invoice filters: exact `documentNumber`, exact `status` (`Draft` | `Issued`), inclusive `createdFromUtc` / `createdToUtc`. Accrual filters: `descriptionPrefix`, exact `status` (`Draft` | `Recognized` | `Reversed`), recognition date range. Draft invoices can be issued from the list (`Draft` → `Issued`); when a draft still needs a due date or a positive line, the shell collects those fields and calls the existing set-due-date / add-line / issue API endpoints before refreshing the list. Draft accruals can be recognized from the list (`Draft` → `Recognized`) via the existing recognize API, then the list refreshes. Recognized accruals can be reversed (`Recognized` → `Reversed`) with a required reason via the existing reverse API. Journals support create draft → add debit/credit lines against chart-of-accounts accounts → post balanced journal entry → post to immutable ledger, with list/detail URL state (`view=journals`, optional `status`, `journalEntryId`). Accounts lists the workspace chart of accounts, filters by search / status / type, creates accounts, opens detail for rename / change-code / change-type / archive, and can hand off to Account statement or Journals (`view=accounts`, optional `accountQ`, `status`, `type`, `accountId`). Ledger lists immutable ledger postings for the workspace, applies optional posted-date and source-journal filters, opens posting detail, and can hand off to the source journal entry or account statement (`view=ledger`, optional `ledgerPostingId`, `postedFrom`, `postedTo`, `sourceJournalEntryId`). Trial balance loads the workspace trial balance from ledger postings (`view=trial-balance`) with totals, `isBalanced`, and per-account debit/credit lines. Account statement lists account balances, opens a per-account ledger statement, applies optional period filters, and can open the related journal entry (`view=account-statement`, optional `accountId`, `periodFrom`, `periodTo`). Customer ledger groups Issued invoices by `counterpartyReference`, filters by search and overdue aging bucket, opens customer open-items detail, creates an Accrual from a selected invoice, and can hand off to Invoices, Accruals, or payment collections (`view=customer-ledger`, optional `customerQ`, `aging`, `counterpartyReference`, `invoiceId`).

Shell state is shareable via the browser URL and **Скопіювати посилання**:

| Query param | Meaning |
| --- | --- |
| `view` | `dashboard` (default), `workspace`, `invoices`, `accruals`, `journals`, `accounts`, `ledger`, `trial-balance`, `account-statement`, `customer-ledger` |
| `workspaceId` | active finance workspace GUID |
| `page` | list page (omitted when `1`) |
| `documentNumber`, `status`, `createdFrom`, `createdTo` | invoice list filters when `view=invoices` (`status`: `Draft` \| `Issued`; `created*` are `YYYY-MM-DD` date inputs) |
| `queue`, `aging`, `panel`, `queueShowSettled` | payment collection workspace when `view=invoices` (`queue=overdue`; optional aging bucket; `panel=followups\|workbench`; `queueShowSettled=1` includes locally settled Paid/Completed cases in the overdue queue table — hidden by default) |
| `descriptionPrefix`, `status`, `recognitionFrom`, `recognitionTo` | accrual list filters when `view=accruals` (`status`: `Draft` \| `Recognized` \| `Reversed`; recognition dates are `YYYY-MM-DD`) |
| `status`, `journalEntryId` | journal list/detail when `view=journals` (`status`: `Draft` \| `Posted`; `journalEntryId` deep-links detail). Create accounts, draft lines, **Post journal entry**, then **Post to ledger** — persisted via Finance API |
| `accountQ`, `status`, `type`, `accountId` | chart of accounts when `view=accounts` (`accountQ` searches code/name; `status`: `Active` \| `Archived`; `type`: `Asset` \| `Liability` \| `Equity` \| `Revenue` \| `Expense`; `accountId` deep-links detail). Create, rename, change code/type, **Archive** — persisted via Finance API |
| `ledgerPostingId`, `postedFrom`, `postedTo`, `sourceJournalEntryId` | ledger list/detail when `view=ledger` (`posted*` are `YYYY-MM-DD`; `sourceJournalEntryId` filters by source journal; `ledgerPostingId` deep-links detail). Open **Journal entry** or **Account statement** from a posting line |
| `view=trial-balance` | trial balance report for the active workspace (no extra list filters) |
| `accountId`, `periodFrom`, `periodTo` | account statement detail/period when `view=account-statement` (`period*` are `YYYY-MM-DD`) |
| `customerQ`, `aging`, `counterpartyReference`, `invoiceId` | customer ledger when `view=customer-ledger` (`customerQ` searches counterparties; `aging` is an overdue bucket; `counterpartyReference` opens that customer; `invoiceId` opens an open-item for create-accrual / handoff) |

**Чернетки** / **Чернетки рахунків** opens Invoices with `status=Draft`, page 1, and other invoice filters cleared. Refresh and shared links restore the same URL state.

## Documentation

- Product vision and MVP scope: `docs/product/`
- Roadmap: `docs/roadmap/Roadmap.md`
- Architecture: `docs/architecture/`
- Architecture decision records: `docs/decisions/`

## Boundaries

Finance is a separate bounded context, deployable product, and Git repository. It does not share internal databases with CRM or other VectorFlow products. Cross-product integration will use public HTTP contracts, events, stable external references, idempotency, and inbox/outbox patterns when persistence is introduced.

F1 is in progress via focused sub-slices. F1A publishes the Finance workspace domain foundation only; application, persistence, HTTP, membership, and UI remain deferred to F1B–F1F.
