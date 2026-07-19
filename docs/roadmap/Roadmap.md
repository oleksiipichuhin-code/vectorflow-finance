# Roadmap — VectorFlow Finance

Status key:

- **Complete** — published milestone
- **In Progress** — actively being delivered
- **Planned** — approved direction, not started
- **Implemented (unpublished)** — present in working tree, not yet committed/published

| Phase | Name | Status |
|-------|------|--------|
| F0 | Product and Architecture Foundation | Complete |
| F1 | Organization Finance Context | In Progress |
| F2 | Money and Financial Accounts | In Progress |
| F3 | Counterparty Financial Snapshots | Planned |
| F4 | Invoice and Accrual Foundation | Planned |
| F5 | Payment and Allocation Foundation | Planned |
| F6 | Cash-Flow Planning | Planned |
| F7 | Finance UI MVP | Planned |
| F8 | Cross-Product Integrations | Planned |
| F9 | Bank Statement Import and Reconciliation | Planned |

## F1 sub-slices

| Slice | Name | Status |
|-------|------|--------|
| F1A | FinanceWorkspace Domain Foundation | Complete |
| F1B | Finance Workspace Application Boundary | Complete |
| F1C | Finance Workspace Persistence | Complete |
| F1D | Finance Workspace HTTP Surface | Complete |
| F1E | Membership and Authorization Foundation | Planned |
| F1F | Runtime and UI Acceptance | Planned |

F1 as a whole remains incomplete until later sub-slices are delivered and published.

## F2 sub-slices

| Slice | Name | Status |
|-------|------|--------|
| F2A | Chart of Accounts Domain Foundation | Complete |
| F2B | Account Application Boundary | Complete |
| F2C | Account Persistence | Complete |
| F2D | Account HTTP Surface | Complete |
| F2E+ | Remaining Money and Financial Accounts work | Planned |

F2A–F2D are published. Remaining F2 work after F2D requires design; there are no approved implementation slices beyond F2D yet. F2 as a whole remains incomplete until later sub-slices are designed, delivered, and published.

## Phase intent

### F0 — Product and Architecture Foundation

Establish the repository, solution structure, architecture decisions, foundation types, health runtime, and frontend shell.

### F1 — Organization Finance Context

Introduce finance organization and workspace context without absorbing CRM master data. Delivery is sliced as F1A–F1F above.

### F2 — Money and Financial Accounts

Operationalize monetary representation and financial account structures. F2A–F2D (domain through HTTP surface for Accounts) are complete and published. Remaining F2 work stays planned until separately designed.

### F3 — Counterparty Financial Snapshots

Capture financially significant counterparty details as immutable historical snapshots at document and operation creation time.

### F4 — Invoice and Accrual Foundation

Introduce invoices and accruals as distinct financial documents.

### F5 — Payment and Allocation Foundation

Introduce payments as distinct from invoices and support partial payments with allocations.

### F6 — Cash-Flow Planning

Provide planning views and structures for expected cash movement.

### F7 — Finance UI MVP

Deliver the first operational Ukrainian UI for the implemented finance workflows.

### F8 — Cross-Product Integrations

Connect Finance to other VectorFlow products through public HTTP contracts, events, stable external references, idempotency, and inbox/outbox patterns.

### F9 — Bank Statement Import and Reconciliation

Import bank statements and reconcile them against finance records without storing banking secrets or auto-executing payments.
