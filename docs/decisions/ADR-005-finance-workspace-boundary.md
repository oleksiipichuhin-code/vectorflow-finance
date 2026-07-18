# ADR-005 — Finance Workspace Boundary

## Status

Accepted

## Context

Finance needs a durable aggregate that scopes future financial accounts, documents, payments, allocations, cash-flow plans, and ledger entries. Platform Foundation already owns organizations, platform workspaces, memberships, and identity. Duplicating organization master data inside Finance would create conflicting systems of record.

## Decision

1. Introduce `FinanceWorkspace` as a Finance-owned domain aggregate.
2. Reference Platform Foundation through `PlatformOrganizationId` and `PlatformWorkspaceId` only.
3. Do not model Finance workspace as a bank account, legal entity master, CRM partner, or platform workspace substitute.
4. Use explicit lifecycle states `Active`, `Suspended`, and `Archived` with archive terminal in this slice.
5. Keep identifiers system-generated; never require manual GUID entry in UI.
6. Defer membership, authorization, persistence, HTTP, and uniqueness/provisioning rules to later F1 slices.
7. Defer domain-event infrastructure until a focused event abstraction slice exists.

## Consequences

Positive:

- clear Finance ownership of the financial boundary;
- no mutable local copy of Platform Organization;
- lifecycle rules established before persistence and APIs.

Trade-offs:

- application and HTTP consumers cannot yet provision workspaces;
- multi-workspace uniqueness remains undecided until F1B/F1C;
- domain events are documented but not emitted in F1A.
