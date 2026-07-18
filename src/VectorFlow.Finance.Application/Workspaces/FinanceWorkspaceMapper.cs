using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Workspaces;

internal static class FinanceWorkspaceMapper
{
    public static FinanceWorkspaceDto ToDto(FinanceWorkspace workspace) =>
        new(
            workspace.Id.Value,
            workspace.PlatformOrganizationId.Value,
            workspace.PlatformWorkspaceId.Value,
            workspace.Name,
            workspace.DefaultCurrency.Code,
            workspace.Status.ToString(),
            workspace.CreatedAt,
            workspace.UpdatedAt);
}
