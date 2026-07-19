namespace VectorFlow.Finance.Application.AccountBalances.Queries;

public sealed record GetAccountBalanceQuery(
    Guid FinanceWorkspaceId,
    Guid AccountId);

public sealed record GetAccountBalancesQuery(
    Guid FinanceWorkspaceId);
