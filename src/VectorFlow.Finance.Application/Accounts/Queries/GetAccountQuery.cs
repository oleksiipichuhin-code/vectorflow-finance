namespace VectorFlow.Finance.Application.Accounts.Queries;

public sealed record GetAccountQuery(
    Guid FinanceWorkspaceId,
    Guid Id);
