namespace VectorFlow.Finance.Contracts.Workspaces;

public sealed record UpdateFinanceWorkspaceRequest(
    string? Name,
    string? DefaultCurrency);
