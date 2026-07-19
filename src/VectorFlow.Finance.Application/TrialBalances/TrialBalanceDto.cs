namespace VectorFlow.Finance.Application.TrialBalances;

public sealed record TrialBalanceLineDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    decimal DebitTotal,
    decimal CreditTotal,
    decimal Balance,
    string BalanceSide);

public sealed record TrialBalanceDto(
    Guid FinanceWorkspaceId,
    DateTimeOffset GeneratedAtUtc,
    decimal TotalDebit,
    decimal TotalCredit,
    bool IsBalanced,
    IReadOnlyList<TrialBalanceLineDto> Lines);
