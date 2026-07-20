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
- draft mutations: document number, counterparty reference, currency, due date, add/update/remove line;
- issue invoice (`Draft` → `Issued`).

`IInvoiceRepository` is the Application persistence port (`GetByIdAsync` and `ListByWorkspaceAsync` always workspace-scoped, `AddAsync`, `SaveChangesAsync`). Get-by-document-number, search, filters, and pagination remain later slices. Issue does not create journal entries or ledger postings.

## Persistence (F4E3)

Invoice aggregates are stored via EF Core in Infrastructure:

- `InvoiceRepository` implements `IInvoiceRepository` with workspace-scoped `GetByIdAsync` and `ListByWorkspaceAsync` (CreatedAt descending, then Id descending);
- `Invoice` and `InvoiceLine` map as aggregate root + child rows (`_lines` field access, cascade delete);
- `TotalAmount` and `DomainEvents` are not persisted columns;
- migration `AddInvoices` creates `Invoices` / `InvoiceLines`;
- `DocumentNumber` uniqueness is not enforced at the database;
- get-by-document-number, search, filters, and pagination are not implemented;
- general-ledger posting, payments, and accruals remain later slices.

## HTTP surface (F4E4 / F4J)

Workspace-scoped Invoice HTTP API under `/api/finance-workspaces/{financeWorkspaceId}/invoices`:

| Method | Route | Application use case | Success |
|--------|-------|----------------------|---------|
| POST | `/` | Create invoice | 201 |
| GET | `/` | List invoices for workspace (newest first) | 200 |
| GET | `/{invoiceId}` | Get by id | 200 |
| POST | `/{invoiceId}/change-document-number` | Change document number | 200 |
| POST | `/{invoiceId}/change-counterparty` | Change counterparty | 200 |
| POST | `/{invoiceId}/change-currency` | Change currency | 200 |
| POST | `/{invoiceId}/set-due-date` | Set due date | 200 |
| POST | `/{invoiceId}/lines` | Add line | 200 |
| PUT | `/{invoiceId}/lines/{lineId}` | Update line | 200 |
| DELETE | `/{invoiceId}/lines/{lineId}` | Remove line | 200 |
| POST | `/{invoiceId}/issue` | Issue invoice | 200 |

Status mapping via existing `ApplicationResultHttp`: ValidationFailed → 400, NotFound → 404, Conflict → 409. Single-invoice responses use Application `InvoiceDto`. List returns a JSON array of `InvoiceDto` (empty array when the workspace has no invoices; not 404). List ordering: `CreatedAt` descending, then `InvoiceId` descending. List does not include search, filters, pagination, or total-count metadata.

Deferred: search/pagination/filters, get-by-document-number, payments, accruals, ledger posting from Issue, authorization redesign.