# Finance Workspace

## Purpose

`FinanceWorkspace` is the Finance-owned aggregate that represents a financial boundary within one authoritative Platform Organization and one authoritative Platform Workspace.

```text
Platform Organization
    └── Platform Workspace
            └── FinanceWorkspace
                    └── future financial aggregates
```

A Finance workspace will later own or contain financial accounts, counterparty financial snapshots, invoices and accruals, payments and allocations, cash-flow plans, and immutable ledger entries. Those aggregates are not implemented in F1A.

## Ownership boundary

Platform Foundation remains authoritative for:

- organizations;
- platform workspaces;
- memberships;
- identity;
- platform-level capabilities and entitlements.

Finance does **not** duplicate Platform Organization as a mutable local master. `FinanceWorkspace` stores stable references only:

- `PlatformOrganizationId`
- `PlatformWorkspaceId`

## What a Finance workspace is not

A Finance workspace is not:

- a bank account;
- a legal entity master record;
- a CRM partner;
- a general platform workspace.

## Aggregate state (F1A)

| Field | Meaning |
|-------|---------|
| `Id` | Finance-owned `FinanceWorkspaceId` (system-generated Guid) |
| `PlatformOrganizationId` | External organization reference |
| `PlatformWorkspaceId` | External platform workspace reference |
| `Name` | Trimmed display name (max 200) |
| `DefaultCurrency` | Normalized currency code (`Currency`) |
| `Status` | `Active`, `Suspended`, or `Archived` |
| `CreatedAt` | UTC creation timestamp |
| `UpdatedAt` | UTC last successful mutation timestamp |

Internal identifiers are never manually entered in UI.

## Lifecycle

| Status | Meaning |
|--------|---------|
| Active | Normal financial activity is allowed in future slices |
| Suspended | Readable; future financial mutations will be blocked |
| Archived | Historical retention for audit; terminal in this slice |

Transitions implemented in F1A:

- Active → Suspended
- Suspended → Active
- Active → Archived
- Suspended → Archived

Archived cannot be reactivated without an explicit future owner-approved policy. Repeated suspend/archive attempts are rejected explicitly.

Changing default currency does not convert any financial values that may exist in later slices.

## Domain events

F0 does not provide a domain-event abstraction. F1A deliberately does **not** introduce a broad event framework solely for workspace notifications.

Planned events for a later focused slice:

- `FinanceWorkspaceCreated`
- `FinanceWorkspaceRenamed`
- `FinanceWorkspaceStatusChanged`
- `FinanceWorkspaceDefaultCurrencyChanged`

## Deferred to later F1 slices

- application use cases and DTOs (F1B);
- persistence (F1C);
- HTTP surface (F1D);
- membership and authorization (F1E);
- runtime/UI acceptance (F1F);
- uniqueness and multi-workspace provisioning rules per organization.

Multiple Finance workspaces per organization are architecturally possible; uniqueness rules wait for persistence and application slices.

There is no direct database dependency on CRM, Tender, Sales Agent, or other VectorFlow products.
