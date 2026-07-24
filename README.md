# VectorFlow Finance

VectorFlow Finance is a separate financial product in the VectorFlow ecosystem. It owns finance workspaces, financial accounts, documents, payments, allocations, cash-flow planning, and an immutable financial ledger.

This repository currently contains **F0 — Product and Architecture Foundation** and **F1A — FinanceWorkspace Domain Foundation** (published). F1 remains in progress through later sub-slices.

## Solution layout

| Path | Role |
|------|------|
| `src/VectorFlow.Finance.Domain` | Domain value types, aggregates, and rules |
| `src/VectorFlow.Finance.Application` | Application services |
| `src/VectorFlow.Finance.Infrastructure` | Composition and infrastructure adapters |
| `src/VectorFlow.Finance.Api` | HTTP composition root |
| `src/VectorFlow.Finance.Contracts` | Public transport/integration contracts |
| `src/VectorFlow.Finance.Web` | React + Vite frontend shell |
| `tests/*` | Automated tests by layer |

Solution file: `VectorFlow.Finance.slnx`

Domain workspace model details: `docs/architecture/FinanceWorkspace.md`

## Prerequisites

- .NET SDK 10.x
- Node.js 20+ and npm

## Backend

```powershell
dotnet restore
dotnet build
dotnet test
dotnet run --project src/VectorFlow.Finance.Api
```

Local Development URL: `http://localhost:5080` (see `Properties/launchSettings.json`).

Swagger UI (Development): `http://localhost:5080/swagger`

Health endpoint:

```text
GET /health
```

Expected payload:

```json
{
  "product": "VectorFlow Finance API",
  "status": "Healthy",
  "phase": "F0"
}
```

In Development, the API allows CORS from the Vite web origin (`http://localhost:5173` and `http://127.0.0.1:5173`).

## Frontend

```powershell
Set-Location src/VectorFlow.Finance.Web
npm install
npm run dev
```

Local Development URL: `http://localhost:5173`

`VITE_FINANCE_API_BASE_URL` points the browser shell at the real Finance API (`http://localhost:5080` by default in Development; see `.env.example`). Primary UI language is Ukrainian. The shell shows live API health, finance workspace load/create, and paged invoice listing against the running backend (not mocks).

## Documentation

- Product vision and MVP scope: `docs/product/`
- Roadmap: `docs/roadmap/Roadmap.md`
- Architecture: `docs/architecture/`
- Architecture decision records: `docs/decisions/`

## Boundaries

Finance is a separate bounded context, deployable product, and Git repository. It does not share internal databases with CRM or other VectorFlow products. Cross-product integration will use public HTTP contracts, events, stable external references, idempotency, and inbox/outbox patterns when persistence is introduced.

F1 is in progress via focused sub-slices. F1A publishes the Finance workspace domain foundation only; application, persistence, HTTP, membership, and UI remain deferred to F1B–F1F.
