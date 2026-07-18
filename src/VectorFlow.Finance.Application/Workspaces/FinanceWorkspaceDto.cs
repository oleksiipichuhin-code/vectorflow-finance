namespace VectorFlow.Finance.Application.Workspaces;

public sealed record FinanceWorkspaceDto(
    Guid Id,
    Guid PlatformOrganizationId,
    Guid PlatformWorkspaceId,
    string Name,
    string DefaultCurrency,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);
