# Security and Authorization

## F0 security posture

F0 exposes a minimal health endpoint and a non-operational frontend shell. The health response must never include:

- connection strings;
- machine paths;
- secrets;
- environment variables;
- infrastructure topology.

No authorization persistence is implemented in F0.

## Future authorization principle

Access decisions will combine three independent conditions:

```text
capability ∧ permission ∧ entitlement
```

All three must be satisfied for a privileged finance action to succeed.

- **Capability** — what the product allows in principle (product feature surface)
- **Permission** — what the actor is allowed to do in the security model
- **Entitlement** — what the organization/workspace is licensed or enabled to use

## Planned capabilities

| Capability | Intended use |
|------------|--------------|
| `Finance.View` | Read finance information |
| `Finance.ManageDocuments` | Create and manage financial documents |
| `Finance.ManagePayments` | Create and manage payments |
| `Finance.ManageAccounts` | Manage financial accounts |
| `Finance.AllocatePayments` | Allocate payments to documents |
| `Finance.ViewReports` | View finance reports |
| `Finance.Export` | Export finance data |
| `Finance.Administer` | Administer finance configuration |

These capabilities are documented for later phases. F0 does not persist roles, grants, or entitlement state.

## Secrets and banking

Early MVP excludes:

- automatic execution of bank payments;
- storage of banking secrets.

Any future bank import or reconciliation feature must keep credentials outside application source, documentation, and public APIs.

## Audit expectations (later)

When operational finance actions appear, security-sensitive changes should be attributable through correlation and causation identifiers carried by integration and application flows.
