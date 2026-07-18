# ADR-004 — Cross-Product Integrations

## Status

Accepted

## Context

Finance must correlate with activity that originates in other VectorFlow products without sharing internal databases or absorbing foreign schemas as editable master data.

## Decision

Cross-product integration must use:

- public HTTP contracts;
- events;
- stable external references;
- idempotency;
- inbox/outbox patterns where persistence is later introduced.

Future integration reference fields:

- `PlatformOrganizationId`
- `PlatformWorkspaceId`
- `SourceApplication`
- `SourceEntity`
- `SourceExternalId`
- `CorrelationId`
- `CausationId`
- `SchemaVersion`

Shared-database integration and direct reads of another product’s private tables are prohibited.

## Consequences

Positive:

- products remain independently deployable;
- contracts can evolve through schema versioning;
- idempotency and inbox/outbox reduce duplicate processing risk.

Trade-offs:

- integration latency and eventual consistency must be designed explicitly;
- teams must maintain published contracts with the same discipline as public APIs.
