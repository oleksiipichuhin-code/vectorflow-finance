namespace VectorFlow.Finance.Application.AccountBalances;

public static class AccountBalanceCalculator
{
    public const string DebitSide = "Debit";
    public const string CreditSide = "Credit";
    public const string ZeroSide = "Zero";

    public static (decimal Balance, string BalanceSide) Compute(decimal debitTotal, decimal creditTotal)
    {
        var balance = debitTotal - creditTotal;
        if (balance > 0m)
        {
            return (balance, DebitSide);
        }

        if (balance < 0m)
        {
            return (balance, CreditSide);
        }

        return (0m, ZeroSide);
    }

    public static AccountBalanceDto ToDto(
        Guid accountId,
        string accountCode,
        string accountName,
        decimal debitTotal,
        decimal creditTotal)
    {
        var (balance, side) = Compute(debitTotal, creditTotal);
        return new AccountBalanceDto(
            accountId,
            accountCode,
            accountName,
            debitTotal,
            creditTotal,
            balance,
            side);
    }

    public static AccountBalanceSummaryDto ToSummary(
        Guid accountId,
        string accountCode,
        string accountName,
        decimal debitTotal,
        decimal creditTotal)
    {
        var (balance, side) = Compute(debitTotal, creditTotal);
        return new AccountBalanceSummaryDto(
            accountId,
            accountCode,
            accountName,
            debitTotal,
            creditTotal,
            balance,
            side);
    }
}
