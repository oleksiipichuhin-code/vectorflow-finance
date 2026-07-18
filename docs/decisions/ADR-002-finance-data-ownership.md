# ADR-002 — Finance Data Ownership

## Status

Accepted

## Context

Operational finance needs durable records for accounts, documents, payments, allocations, cash-flow plans, and ledger history. CRM needs editable current profiles, contacts, and relationship history. Mixing these ownership models creates ambiguity about which system is authoritative.

## Decision

Finance will eventually own:

- finance workspaces;
- financial accounts;
- accruals;
- invoices and other financial documents;
- payments;
- payment allocations;
- cash-flow plans;
- immutable financial ledger records.

CRM owns:

- current partner/company profile;
- contacts;
- relationship history.

When financially significant counterparty details are needed for a finance document or operation, Finance preserves a historical snapshot. That snapshot is not an independently editable CRM master record.

## Consequences

Positive:

- authoritative finance history remains inside Finance;
- CRM remains the system of record for living relationship data;
- audits can rely on finance snapshots without mutating CRM history.

Trade-offs:

- snapshot refresh or enrichment requires explicit processes;
- UI experiences must distinguish current CRM profile from historical finance evidence.
