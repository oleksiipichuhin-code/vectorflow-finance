namespace VectorFlow.Finance.Application.GeneralLedger;

/// <summary>
/// Converts a signed net (debit − credit) into debit/credit presentation for statement balances.
/// </summary>
public static class AccountStatementBalancePresentation
{
    public static (decimal Debit, decimal Credit) FromNet(decimal net)
    {
        if (net > 0m)
        {
            return (net, 0m);
        }

        if (net < 0m)
        {
            return (0m, -net);
        }

        return (0m, 0m);
    }
}
