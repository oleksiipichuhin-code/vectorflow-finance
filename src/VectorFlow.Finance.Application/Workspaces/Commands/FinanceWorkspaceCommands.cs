namespace VectorFlow.Finance.Application.Workspaces.Commands;

public sealed record CreateFinanceWorkspaceCommand(
    Guid PlatformOrganizationId,
    Guid PlatformWorkspaceId,
    string Name,
    string DefaultCurrency);

public sealed record RenameFinanceWorkspaceCommand(
    Guid Id,
    string Name);

public sealed record ChangeFinanceWorkspaceDefaultCurrencyCommand(
    Guid Id,
    string DefaultCurrency);

public sealed record UpdateFinanceWorkspaceCommand(
    Guid Id,
    string? Name,
    string? DefaultCurrency);

public sealed record SuspendFinanceWorkspaceCommand(Guid Id);

public sealed record ReactivateFinanceWorkspaceCommand(Guid Id);

public sealed record ArchiveFinanceWorkspaceCommand(Guid Id);
