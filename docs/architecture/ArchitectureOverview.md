# Architecture Overview

## Product boundary

VectorFlow Finance is:

- a separate bounded context;
- a separate deployable product;
- a separate Git repository;
- independent from the internal databases of other VectorFlow products.

The API project is the composition root. Domain rules remain free of infrastructure and transport concerns.

## Layering

Dependency direction:

```text
Api
 ├── Application
 ├── Infrastructure
 └── Contracts

Infrastructure
 ├── Application
 ├── Domain
 └── Contracts

Application
 ├── Domain
 └── Contracts

Domain
  (no project dependencies)

Contracts
  (independent transport/integration contracts)
```

Rules:

- Domain must not depend on Infrastructure or Api.
- Application must not depend on Infrastructure or Api.
- Contracts must not depend on Infrastructure or Api.
- Tests depend only on the layer under test and its legitimate dependencies.
- Circular project references are forbidden.

## Runtime surfaces

### API

`VectorFlow.Finance.Api` hosts HTTP endpoints. F0 exposes only `GET /health`.

The health payload identifies product, status, and phase. It must not expose connection strings, machine paths, secrets, environment variables, or infrastructure topology.

### Web

`VectorFlow.Finance.Web` is a React + Vite shell. F0 presents foundation status in Ukrainian and does not implement operational finance navigation.

## Foundation types

F0 includes:

- `PlatformOrganizationId`
- `PlatformWorkspaceId`
- `Money`

F1A adds Finance-owned workspace types:

- `FinanceWorkspace`
- `FinanceWorkspaceId`
- `FinanceWorkspaceStatus`
- `Currency` (shared currency-code value object aligned with `Money` normalization)

See `docs/architecture/FinanceWorkspace.md`. F1A does not introduce accounts, invoices, payments, ledger entries, persistence, or HTTP workspace APIs.

## Persistence posture

F0/F1A do not introduce a finance database. When persistence appears in later phases, Finance will own its own data store and will not share tables or schemas with CRM or other products.

## Integration posture

Cross-product integration will use:

- public HTTP contracts;
- events;
- stable external references;
- idempotency;
- inbox/outbox patterns where persistence is later introduced.

Finance correlates external activity; it does not import foreign internal models as editable master data.
