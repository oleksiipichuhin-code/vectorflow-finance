# Invoice

## Purpose

`Invoice` is the Finance-owned commercial document aggregate that records amounts owed by a counterparty within one `FinanceWorkspace`.

Invoices are distinct from payments, accruals, and general-ledger postings. Those concerns remain later slices.

## Aggregate state (F4E)

| Field | Meaning |
|-------|---------|
| `Id` | Finance-owned `InvoiceId` |
| `FinanceWorkspaceId` | Owning finance workspace |
| `DocumentNumber` | Trimmed operational document label (max 64); uniqueness is not enforced in Domain |
| `CounterpartyReference` | Opaque external counterparty identifier (not a CRM master) |
| `Currency` | Invoice currency; lines store decimal amounts in this currency |
| `Status` | `Draft` or `Issued` |
| `Lines` | Ordered commercial lines (`Quantity`, `UnitPrice`, computed `LineAmount`) |
| `TotalAmount` | Sum of line amounts |
| `DueDate` | Required before issue; calendar date must not precede issue date |
| `CreatedAt` / `UpdatedAt` | UTC timestamps |
| `IssuedAt` | Set when the invoice is issued |

## Lifecycle

| Status | Meaning |
|--------|---------|
| Draft | Metadata and lines may change |
| Issued | Content is immutable; payments and ledger posting are later |

Transitions in F4E:

- Draft → Issued via `Issue`

Repeated issue is rejected. Paid / partially paid / cancelled statuses are out of scope.

## Line money model

- `Quantity > 0`
- `UnitPrice >= 0`
- `LineAmount = Quantity × UnitPrice` (exact `decimal`)
- `LineAmount > 0`
- No tax, FX, or project-wide rounding policy in this slice

## Out of scope for F4E

- Application handlers and persistence
- HTTP surface
- General ledger posting
- Payments and allocations
- Accruals
- Full `CounterpartySnapshot`
- Credit notes / recurring invoices

## Application boundary (F4E2)

Application use cases over the F4E aggregate (no persistence implementation, no HTTP):

- create invoice in an existing finance workspace;
- get invoice by id (workspace-scoped);
- list invoices for a finance workspace (CreatedAt descending, then InvoiceId descending; empty list when none);
- list invoices for a finance workspace with paging (`page`, `pageSize`, optional exact `status` of `Draft` or `Issued`, optional inclusive `createdFromUtc` / `createdToUtc`, optional exact `documentNumber`, optional exact `counterpartyReference`, optional exact `currency`, optional inclusive `issuedFromUtc` / `issuedToUtc`; CreatedAt descending, then InvoiceId descending; empty page when none; returns `items`, `page`, `pageSize`, `totalCount`);
- list invoices by document number within a finance workspace (CreatedAt descending, then InvoiceId descending; empty list when none; multiple invoices may share one DocumentNumber; exact ordinal match after trim);
- draft mutations: document number, counterparty reference, currency, due date, add/update/remove line;
- issue invoice (`Draft` → `Issued`).

`IInvoiceRepository` is the Application persistence port (`GetByIdAsync`, `ListByWorkspaceAsync`, `ListByDocumentNumberAsync`, and `ListPagedAsync` always workspace-scoped, `AddAsync`, `SaveChangesAsync`). Optional paged `status` filter is exact enum match only. Optional paged CreatedAt bounds are inclusive absolute `DateTimeOffset` instants (`createdFromUtc` / `createdToUtc`; either alone allowed; `from > to` is validation failure). Optional paged `documentNumber` is a positive exact ordinal match after the same trim/normalization as list-by-document-number (missing means no DocumentNumber filter; blank/whitespace and overlength are ValidationFailed; no partial/prefix/full-text mode). Optional paged `counterpartyReference` is a positive exact Ordinal match after `CounterpartyReference` trim/normalization (missing means no CounterpartyReference filter; blank/whitespace and overlength are ValidationFailed; no partial/prefix/case-insensitive/full-text mode). Optional paged `currency` is a positive exact Ordinal match on the normalized stored `Currency.Code` after existing `Currency` trim + `ToUpperInvariant` normalization (missing means no Currency filter; blank/whitespace are ValidationFailed; no partial/prefix/full-text mode; no new ISO allowlist; no multi-currency semantics). Optional paged IssuedAt bounds are inclusive absolute `DateTimeOffset` instants (`issuedFromUtc` / `issuedToUtc`; either alone allowed; `from > to` is validation failure; when any IssuedAt bound is present, invoices with null `IssuedAt` are excluded; filters remain independent of `status` and compose with AND). Remaining multi-field filters and full-text search remain later slices. Issue does not create journal entries or ledger postings.

## Persistence (F4E3)

Invoice aggregates are stored via EF Core in Infrastructure:

- `InvoiceRepository` implements `IInvoiceRepository` with workspace-scoped `GetByIdAsync`, `ListByWorkspaceAsync`, `ListByDocumentNumberAsync`, and `ListPagedAsync` (CreatedAt descending, then Id descending). Paged path: SQL filters FinanceWorkspaceId, optional Status, optional exact DocumentNumber, optional exact CounterpartyReference, and optional exact Currency, then a single materialization with lines; optional inclusive CreatedAt bounds, optional inclusive IssuedAt bounds (null IssuedAt excluded when any IssuedAt bound is present), `totalCount`, Order, Skip, and Take run in memory because the SQLite provider cannot translate DateTimeOffset comparisons or ORDER BY DateTimeOffset (conscious MVP trade-off; storage normalization / indexing may be a later optimization slice);
- `Invoice` and `InvoiceLine` map as aggregate root + child rows (`_lines` field access, cascade delete);
- `TotalAmount` and `DomainEvents` are not persisted columns;
- migration `AddInvoices` creates `Invoices` / `InvoiceLines`;
- `DocumentNumber` uniqueness is not enforced at the database and no DocumentNumber index is added;
- no Status or CreatedAt index is added (workspace index only);
- remaining multi-field filters and full-text search are not implemented;
- general-ledger posting, payments, and accruals remain later slices.

## HTTP surface (F4E4 / F4J / F4M / F4N / F4O / F4P / F4U / F4X / F4Y / F4AB)

Workspace-scoped Invoice HTTP API under `/api/finance-workspaces/{financeWorkspaceId}/invoices`:

| Method | Route | Application use case | Success |
|--------|-------|----------------------|---------|
| POST | `/` | Create invoice | 201 |
| GET | `/?page={page}&pageSize={pageSize}&status={status?}&createdFromUtc={from?}&createdToUtc={to?}&documentNumber={number?}&counterpartyReference={reference?}&currency={currency?}&issuedFromUtc={issuedFrom?}&issuedToUtc={issuedTo?}` | List invoices for workspace (paged, newest first; optional status, CreatedAt range, document number, counterparty reference, currency, and IssuedAt range) | 200 |
| GET | `/by-document-number?documentNumber={value}` | List invoices by document number (newest first) | 200 |
| GET | `/{invoiceId}` | Get by id | 200 |
| POST | `/{invoiceId}/change-document-number` | Change document number | 200 |
| POST | `/{invoiceId}/change-counterparty` | Change counterparty | 200 |
| POST | `/{invoiceId}/change-currency` | Change currency | 200 |
| POST | `/{invoiceId}/set-due-date` | Set due date | 200 |
| POST | `/{invoiceId}/lines` | Add line | 200 |
| PUT | `/{invoiceId}/lines/{lineId}` | Update line | 200 |
| DELETE | `/{invoiceId}/lines/{lineId}` | Remove line | 200 |
| POST | `/{invoiceId}/issue` | Issue invoice | 200 |

Status mapping via existing `ApplicationResultHttp`: ValidationFailed → 400, NotFound → 404, Conflict → 409. Single-invoice responses use Application `InvoiceDto`. List-by-document-number returns a JSON array of `InvoiceDto` (empty array when none; not 404). Paged list returns Application `PageResult<InvoiceDto>` with `items`, `page`, `pageSize`, and `totalCount` (empty `items` when none; not 404). List and list-by-document-number are read-only. Ordering: `CreatedAt` descending, then `InvoiceId` descending. Paged list requires `page >= 1` and `1 <= pageSize <= 100`; invalid paging is ValidationFailed. Optional paged query parameter `status` accepts exact Ordinal `Draft` or `Issued` only; missing `status` means no status filter (F4N all-status behavior); explicitly blank, whitespace, case variants, numeric values, or unknown names are ValidationFailed. Optional paged query parameters `createdFromUtc` and `createdToUtc` are nullable `DateTimeOffset` absolute instants; either bound alone is allowed; when both are present they form an inclusive closed interval and `createdFromUtc > createdToUtc` is ValidationFailed; equal bounds match the exact instant; offsets are compared as absolute moments (not forced to zero offset); malformed date values fail ASP.NET binding with HTTP 400. Optional paged query parameter `documentNumber` uses the same trim/normalization and blank/overlength ValidationFailed posture as list-by-document-number; missing means no DocumentNumber filter; when provided, only exact ordinal matches are returned (positive filter only; no partial/prefix/suffix/case-insensitive/full-text mode). Optional paged query parameter `counterpartyReference` uses existing `CounterpartyReference` trim/normalization and blank/overlength ValidationFailed posture; missing means no CounterpartyReference filter; when provided, only exact Ordinal matches on `Invoice.CounterpartyReference` are returned (positive filter only; no partial/prefix/suffix/case-insensitive/full-text mode). Optional paged query parameter `currency` uses existing `Currency` trim + `ToUpperInvariant` normalization and blank/whitespace ValidationFailed posture; missing means no Currency filter; when provided, only exact Ordinal matches on the normalized stored `Invoice.Currency` code are returned (positive filter only; callers may supply lowercase codes because the value object uppercases; that is normalization, not a case-insensitive search mode; no partial/prefix/suffix/full-text mode; no new ISO allowlist; no multi-currency / conversion semantics). Optional paged query parameters `issuedFromUtc` and `issuedToUtc` are nullable `DateTimeOffset` absolute instants filtering `IssuedAt`; either bound alone is allowed; both omitted means no IssuedAt filter (Draft and Issued remain eligible subject to other filters); equal bounds are valid and match that exact instant; when both are present and `issuedFromUtc > issuedToUtc`, validation fails (ValidationFailed → 400); when any IssuedAt bound is present, invoices with null `IssuedAt` are excluded (no −∞/+∞ treatment and no implicit `status=Issued`); filters remain independent and compose with AND; malformed date values fail ASP.NET binding with HTTP 400. Workspace, optional status, optional document-number, optional counterparty-reference, and optional currency filtering remain SQL predicates; CreatedAt and IssuedAt range filtering, `totalCount`, ordering, and Skip/Take run in memory after one materialization because SQLite cannot translate DateTimeOffset comparisons or ORDER BY DateTimeOffset (no schema/index/migration change in F4AB). List-by-document-number filters by workspace and exact ordinal `DocumentNumber` after trim; blank/overlength document numbers are ValidationFailed; multiple invoices may share one document number; there is no DocumentNumber index or uniqueness guarantee. Paged list does not include remaining multi-field filters, full-text search, or client-controlled sort. List-by-document-number does not include pagination or total-count metadata.

Deferred: remaining multi-field filters / full-text search, payments, accruals, ledger posting from Issue, authorization redesign.