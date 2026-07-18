# ADR-001 — Separate Finance Product

## Status

Accepted

## Context

VectorFlow already contains products that handle commercial relationships, procurement, and other operational domains. Financial accounts, invoices, payments, allocations, cash-flow planning, and an immutable ledger have different consistency, audit, and compliance needs from CRM master data.

Embedding Finance inside another product repository or database would couple release cycles, obscure ownership, and increase the risk of accidental shared-schema coupling.

## Decision

VectorFlow Finance is:

- a separate bounded context;
- a separate deployable product;
- a separate Git repository;
- independent from the internal databases of other products.

## Consequences

Positive:

- clear ownership of finance data and invariants;
- independent deployment and versioning;
- reduced risk of CRM/finance schema entanglement.

Trade-offs:

- cross-product workflows require explicit contracts and events;
- duplicate presentation of some business context must be carefully snapshot-based rather than master-data duplication.
