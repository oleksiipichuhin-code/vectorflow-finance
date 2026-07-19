namespace VectorFlow.Finance.Application.AccountBalances;

public sealed record AccountBalanceDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    decimal DebitTotal,
    decimal CreditTotal,
    decimal Balance,
    string BalanceSide);

public sealed record AccountBalanceSummaryDto(
    Guid AccountId,
    string AccountCode,
    string AccountName,
    decimal DebitTotal,
    decimal CreditTotal,
    decimal Balance,
    string BalanceSide);
