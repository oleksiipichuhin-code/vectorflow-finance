# Domain Model

## Current F0 foundation

F0 intentionally contains only minimal foundation value types.

### PlatformOrganizationId

Stable external reference to a platform organization. Rejects empty identifiers. Used for correlation across products, not as a substitute for CRM profile ownership.

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

## Planned ownership (not implemented in F0)

Finance will eventually own:

- finance workspaces;
- financial accounts;
- accruals;
- invoices and other financial documents;
- payments;
- payment allocations;
- cash-flow plans;
- immutable financial ledger records.

The following types are explicitly out of F0 and must not be added during foundation recovery:

- `FinanceWorkspace`
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

Ledger posting and correction workflows are documentation-only in F0.
