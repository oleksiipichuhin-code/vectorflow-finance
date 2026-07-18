# Domain Model

## Foundation types (F0)

### PlatformOrganizationId

Stable external reference to a platform organization. Rejects empty identifiers. Used for correlation across products, not as a substitute for CRM profile ownership or a mutable Platform Organization master inside Finance.

### PlatformWorkspaceId

Stable external reference to a platform workspace within an organization context. Rejects empty identifiers.

### Money

Monetary value object with:

- `decimal Amount`
- currency identifier/value

Rules:

- floating-point types (`float`, `double`) are prohibited for financial amounts;
- blank or whitespace currency values are rejected;
- currency is normalized for equality comparisons;
- value-object equality is preserved.

### Currency

ISO-style currency code value object aligned with `Money` normalization (`Trim` + upper invariant). Used by `FinanceWorkspace.DefaultCurrency`.

## Finance workspace (F1A)

Namespace: `VectorFlow.Finance.Domain.Workspaces`

### FinanceWorkspaceId

Strongly typed Guid identifier. Empty Guid is invalid. Created deliberately via constructor or `New()`. Suitable for later persistence as a Guid. Never entered manually in UI.

### FinanceWorkspaceStatus

Stable numeric enum:

| Value | Name | Meaning |
|------:|------|---------|
| 1 | Active | Normal financial activity allowed in future slices |
| 2 | Suspended | Readable; future mutations blocked |
| 3 | Archived | Audit retention; terminal in this slice |

### FinanceWorkspace

Finance-owned aggregate referencing `PlatformOrganizationId` and `PlatformWorkspaceId`. Holds name, default currency, status, and UTC timestamps. Supports create, rename, change default currency, suspend, reactivate, and archive.

Details: `docs/architecture/FinanceWorkspace.md`.

## Planned ownership (later phases)

Finance will eventually own:

- finance workspaces (domain foundation exists in F1A; persistence/HTTP later);
- financial accounts;
- accruals;
- invoices and other financial documents;
- payments;
- payment allocations;
- cash-flow plans;
- immutable financial ledger records.

The following types remain out of F1A implementation:

- `FinancialAccount`
- `Invoice`
- `Payment`
- `LedgerEntry`
- `Budget`
- `CashFlow`
- `CounterpartySnapshot`

## Money and ledger principles

1. Money uses decimal plus currency.
2. Floating-point types are prohibited for financial values.
3. Financial records that have been posted will eventually be immutable.
4. Corrections will use reversal or correction entries rather than silent mutation of posted history.
5. Invoices and payments are distinct concepts.
6. Partial payments and allocations must be supported later.
7. CRM data must not be duplicated as an independently editable master record inside Finance.

Ledger posting and correction workflows remain documentation-only until later phases.
