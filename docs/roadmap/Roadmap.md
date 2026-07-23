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
| F3 | Journal Entry and Ledger Foundation | In Progress |
| F4 | Invoice and Accrual Foundation | In Progress |
| F5 | Payment and Allocation Foundation | In Progress |
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

## F3 sub-slices

| Slice | Name | Status |
|-------|------|--------|
| F3A | Journal Entry Domain Foundation | Complete |
| F3B | Journal Entry Application and Persistence | Complete |
| F3C | Journal Entry HTTP Surface | Complete |
| F3D | Ledger Posting Domain Foundation | Complete |
| F3E | Ledger Posting Application and Persistence | Complete |
| F3F | Ledger Posting HTTP Surface | Complete |

F3A–F3F are published. Decimal precision policy for Debit/Credit remains an open architectural decision. F3 as a whole remains incomplete until later ledger reporting slices are delivered.

## F4 sub-slices

| Slice | Name | Status |
|-------|------|--------|
| F4A | Account Balance Projection Foundation | Complete |
| F4B | Account Balance HTTP Surface | Complete |
| F4C | Trial Balance Foundation | Complete |
| F4D | Trial Balance HTTP API | Complete |
| F4E | Invoice Domain Foundation | Complete |
| F4E2 | Invoice Application Boundary | Complete |
| F4E3 | Invoice Persistence | Complete |
| F4E4 | Invoice HTTP Surface | Complete |
| F4F | Accrual Domain Foundation | Complete |
| F4G | Accrual Application Boundary | Complete |
| F4H | Accrual Persistence | Complete |
| F4I | Accrual HTTP Surface | Complete |
| F4J | Invoice Workspace Listing | Complete |
| F4K | Accrual Workspace Listing | Complete |
| F4L | Accrual Get-By-Invoice | Complete |
| F4M | Invoice Get-By-Document-Number | Complete |
| F4N | Invoice Search (paged listing) | Complete |
| F4O | Invoice Paged Listing Status Filter | Complete |
| F4P | Invoice Paged Listing CreatedAt Range Filter | Complete |
| F4Q | Accrual Paged Listing | Complete |
| F4R | Accrual Paged Status Filter | Complete |
| F4S | Accrual Paged CreatedAt Range Filter | Complete |
| F4T | Accrual Paged Source-Invoice Composition | Complete |
| F4U | Invoice Paged DocumentNumber Composition | Complete |
| F4V | Accrual Paged Type Composition | Complete |
| F4W | Accrual Paged RecognitionDate Range Composition | Complete |
| F4X | Invoice Paged Counterparty Composition | Complete |
| F4Y | Invoice Paged Currency Composition | Complete |
| F4Z | Accrual Paged Currency Composition | Complete |
| F4AA | Accrual Paged Amount Range Composition | Complete |
| F4AB | Invoice Paged IssuedAt Range Composition | Complete |
| F4AC | Invoice Paged DueDate Range Composition | Complete |
| F4AD | Invoice Paged TotalAmount Range Composition | Complete |
| F4AE | Accrual Paged Description Composition | Complete |
| F4AF | Accrual Paged RecognizedAt Range Composition | Complete |
| F4Q+ | Later invoice and Accrual query enhancements | Planned |

F4A–F4AF are published. F4AF Accrual Paged RecognizedAt Range Composition (optional inclusive `recognizedFromUtc` / `recognizedToUtc` on paged Accrual listing filtering lifecycle `RecognizedAt`, not `RecognitionDate`; either bound alone allowed; equal bounds match that exact instant; `recognizedFromUtc > recognizedToUtc` is ValidationFailed; when any RecognizedAt bound is present, null `RecognizedAt` rows are excluded; independent of optional `status` and of RecognitionDate bounds; composes under AND with optional exact `status`, inclusive CreatedAt/RecognitionDate/Amount bounds, exact `sourceInvoiceId`, exact `type`, exact `currency`, and exact `description`; RecognizedAt bounds applied in memory with existing DateTimeOffset filter stage; no Domain, migration, schema, package, Contracts, or DI changes) is published. Remaining invoice query enhancements (other multi-field filters / full-text search), further Accrual text modes, and other deferred Accrual query capabilities remain planned under F4Q+. F4 as a whole remains incomplete.

## F5 sub-slices

| Slice | Name | Status |
|-------|------|--------|
| F5A | General Ledger Account Statement Foundation | Complete |
| F5B | Account Statement HTTP API | Complete |
| F5C+ | Payment / allocation and later work | Planned |

F5A–F5B are published (read-side account statement over ledger postings, including HTTP). Payment and allocation foundation work remains planned. F5 as a whole remains incomplete.

## Phase intent

### F0 — Product and Architecture Foundation

Establish the repository, solution structure, architecture decisions, foundation types, health runtime, and frontend shell.

### F1 — Organization Finance Context

Introduce finance organization and workspace context without absorbing CRM master data. Delivery is sliced as F1A–F1F above.

### F2 — Money and Financial Accounts

Operationalize monetary representation and financial account structures. F2A–F2D (domain through HTTP surface for Accounts) are complete and published. Remaining F2 work stays planned until separately designed.

### F3 — Journal Entry and Ledger Foundation

Introduce double-entry journal entries as the ledger posting foundation. Draft entries may be unbalanced; posted entries are immutable and must balance. Counterparty financial snapshots remain planned for a later slice once journal posting exists.

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
