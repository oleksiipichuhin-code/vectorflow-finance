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
