# Product Vision — VectorFlow Finance

## Purpose

VectorFlow Finance provides operational finance capabilities for organizations that already work inside the VectorFlow ecosystem. It is designed to become the system of record for financial accounts, accruals, invoices and related documents, payments, payment allocations, cash-flow plans, and an immutable financial ledger.

Finance is not a module embedded inside CRM, Tender Platform, or any other product database. It is a separate product with its own bounded context, deployment boundary, and data ownership.

## Product positioning

VectorFlow Finance exists to answer operational questions such as:

- What money is owed and what money is expected?
- Which invoices remain open and which payments have been allocated?
- What is the near-term cash position across financial accounts?
- How do financial operations correlate to activity that originated in other VectorFlow products?

It does not attempt to replace statutory accounting systems, tax platforms, payroll engines, or bank-side payment execution systems.

## Ownership boundary

Finance will eventually own:

- finance workspaces;
- financial accounts;
- accruals;
- invoices and other financial documents;
- payments;
- payment allocations;
- cash-flow plans;
- immutable financial ledger records.

CRM remains the owner of:

- current partner and company profile;
- contacts;
- relationship history.

When financially significant counterparty details are required at the moment a document or operation is created, Finance preserves a historical snapshot. That snapshot is not an independently editable master CRM record.

## Cross-product role

Other VectorFlow products may initiate or enrich financial work through stable external references and published contracts. Finance correlates those references without absorbing their internal schemas or databases.

Future integration reference fields include:

- `PlatformOrganizationId`
- `PlatformWorkspaceId`
- `SourceApplication`
- `SourceEntity`
- `SourceExternalId`
- `CorrelationId`
- `CausationId`
- `SchemaVersion`

## Design principles

1. Money is always represented as decimal amount plus currency.
2. Floating-point types are prohibited for financial values.
3. Posted financial ledger records will be immutable; corrections use reversal or correction entries.
4. Invoices and payments are distinct concepts.
5. Partial payments and allocations must be supported in later phases.
6. Authorization will combine capability, permission, and entitlement.
7. Secrets, banking credentials, and infrastructure topology are never exposed through public health or product surfaces.

## Current phase

F0 establishes the product identity, architecture documentation, solution scaffolding, health runtime, frontend shell, and minimal foundation value types. It does not yet provide operational finance workflows.
