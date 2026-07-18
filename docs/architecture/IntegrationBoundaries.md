# Integration Boundaries

## Separation of products

VectorFlow Finance does not read or write the internal databases of CRM, Tender Platform, or other VectorFlow products. Each product remains independently deployable and independently versioned.

## Ownership split

### Finance owns

- finance workspaces;
- financial accounts;
- accruals;
- invoices and other financial documents;
- payments;
- payment allocations;
- cash-flow plans;
- immutable financial ledger records;
- historical financially significant counterparty snapshots created for finance operations.

### CRM owns

- current partner/company profile;
- contacts;
- relationship history.

Finance may preserve snapshots of counterparty details that were financially significant at document or operation creation time. Those snapshots are historical evidence for finance, not an alternate CRM master.

## Integration mechanisms

Cross-product integration must use:

- public HTTP contracts;
- events;
- stable external references;
- idempotency;
- inbox/outbox patterns where persistence is later introduced.

Direct shared-database integration is prohibited.

## Future integration reference fields

Integrations should carry stable correlation metadata:

| Field | Purpose |
|-------|---------|
| `PlatformOrganizationId` | Organization-level external reference |
| `PlatformWorkspaceId` | Workspace-level external reference |
| `SourceApplication` | Originating product identity |
| `SourceEntity` | Originating entity type |
| `SourceExternalId` | Originating entity identifier |
| `CorrelationId` | End-to-end correlation |
| `CausationId` | Immediate causal predecessor |
| `SchemaVersion` | Contract version for evolution |

These fields define the future integration surface. F0 does not implement the integration runtime.

## Contract package role

`VectorFlow.Finance.Contracts` holds transport and integration contracts that remain independent of Infrastructure and Api implementation details. External consumers should depend on contracts, not on internal domain or infrastructure assemblies.
