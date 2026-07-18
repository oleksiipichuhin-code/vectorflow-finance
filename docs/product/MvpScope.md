# MVP Scope — VectorFlow Finance

## In scope for early MVP (after F0)

The early MVP is expected to deliver a usable operational finance foundation across later roadmap phases, including:

- organization and finance workspace context;
- money and financial accounts;
- counterparty financial snapshots;
- invoice and accrual foundation;
- payment and allocation foundation;
- cash-flow planning;
- a focused finance UI;
- controlled cross-product integrations;
- bank statement import and reconciliation.

Exact delivery order is defined in `docs/roadmap/Roadmap.md`.

## Explicit early MVP exclusions

The following capabilities are excluded from early MVP and must not be treated as near-term delivery commitments:

- statutory accounting;
- tax declarations;
- payroll;
- fiscalization;
- automatic execution of bank payments;
- storage of banking secrets;
- national accounting posting rules;
- full budgeting;
- bank statement reconciliation as a complete accounting substitute beyond operational import and matching needs defined later.

## F0 scope

F0 includes only:

- product and architecture documentation;
- clean architecture solution scaffolding;
- foundation value types (`PlatformOrganizationId`, `PlatformWorkspaceId`, `Money`);
- health API;
- minimal Ukrainian frontend shell;
- automated foundation tests.

F0 excludes:

- finance workspace persistence and HTTP;
- financial accounts;
- invoices;
- payments;
- ledger posting logic;
- operational navigation;
- authorization persistence;
- database persistence.

## F1A scope (published)

F1A adds the Finance workspace **domain** foundation only:

- `FinanceWorkspace`, `FinanceWorkspaceId`, `FinanceWorkspaceStatus`, `Currency`;
- domain invariants and lifecycle transitions;
- focused domain tests;
- architecture and ADR documentation.

F1A excludes application handlers, repositories, EF Core, HTTP workspace endpoints, membership/authorization, and UI.

## Acceptance posture

A capability is considered in MVP only when it is both roadmap-planned and product-owned by Finance. External product concerns remain outside Finance unless exposed through public contracts and stable external references.
