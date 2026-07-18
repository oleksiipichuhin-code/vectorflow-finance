namespace VectorFlow.Finance.Contracts.Workspaces;

public sealed record CreateFinanceWorkspaceRequest(
    Guid PlatformOrganizationId,
    Guid PlatformWorkspaceId,
    string Name,
    string DefaultCurrency);
