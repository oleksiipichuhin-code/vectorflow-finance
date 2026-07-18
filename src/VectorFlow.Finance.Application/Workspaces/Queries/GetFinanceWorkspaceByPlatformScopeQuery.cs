namespace VectorFlow.Finance.Application.Workspaces.Queries;

public sealed record GetFinanceWorkspaceByPlatformScopeQuery(
    Guid PlatformOrganizationId,
    Guid PlatformWorkspaceId);
