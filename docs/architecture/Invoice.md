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
- draft mutations: document number, counterparty reference, currency, due date, add/update/remove line;
- issue invoice (`Draft` → `Issued`).

`IInvoiceRepository` is the Application persistence port (`GetByIdAsync` always workspace-scoped, `AddAsync`, `SaveChangesAsync`). Listing, get-by-document-number, EF Core, migrations, and HTTP remain later slices. Issue does not create journal entries or ledger postings.