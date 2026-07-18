# Roadmap — VectorFlow Finance

Status key:

- **In Progress** — actively being reconstructed or delivered
- **Planned** — approved direction, not started

| Phase | Name | Status |
|-------|------|--------|
| F0 | Product and Architecture Foundation | In Progress |
| F1 | Organization Finance Context | Planned |
| F2 | Money and Financial Accounts | Planned |
| F3 | Counterparty Financial Snapshots | Planned |
| F4 | Invoice and Accrual Foundation | Planned |
| F5 | Payment and Allocation Foundation | Planned |
| F6 | Cash-Flow Planning | Planned |
| F7 | Finance UI MVP | Planned |
| F8 | Cross-Product Integrations | Planned |
| F9 | Bank Statement Import and Reconciliation | Planned |

## Phase intent

### F0 — Product and Architecture Foundation

Establish the repository, solution structure, architecture decisions, foundation types, health runtime, and frontend shell.

### F1 — Organization Finance Context

Introduce finance organization and workspace context without absorbing CRM master data.

### F2 — Money and Financial Accounts

Operationalize monetary representation and financial account structures.

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

## Publication note

This recovery reconstructs F0 locally and publishes it as a new root commit. Future phases remain planned until deliberately started. F1 must not be implemented as part of F0 publication.
