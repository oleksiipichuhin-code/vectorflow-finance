namespace VectorFlow.Finance.Application.Accounts.Queries;

public sealed record GetAccountByCodeQuery(
    Guid FinanceWorkspaceId,
    string Code);
