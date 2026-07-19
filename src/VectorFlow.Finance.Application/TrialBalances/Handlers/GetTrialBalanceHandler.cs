using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Application.TrialBalances.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.TrialBalances.Handlers;

public sealed class GetTrialBalanceHandler
{
    private readonly IAccountBalanceReader _accountBalanceReader;
    private readonly IClock _clock;

    public GetTrialBalanceHandler(IAccountBalanceReader accountBalanceReader, IClock clock)
    {
        _accountBalanceReader = accountBalanceReader;
        _clock = clock;
    }

    public async Task<ApplicationResult<TrialBalanceDto>> HandleAsync(
        GetTrialBalanceQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<TrialBalanceDto>.ValidationFailed(ex.Message);
        }

        var balances = await _accountBalanceReader.ListByWorkspaceAsync(
            financeWorkspaceId,
            cancellationToken);

        var lines = balances
            .Select(balance => new TrialBalanceLineDto(
                balance.AccountId,
                balance.AccountCode,
                balance.AccountName,
                balance.DebitTotal,
                balance.CreditTotal,
                balance.Balance,
                balance.BalanceSide))
            .ToArray();

        var totalDebit = lines.Sum(line => line.DebitTotal);
        var totalCredit = lines.Sum(line => line.CreditTotal);

        return ApplicationResult<TrialBalanceDto>.Success(
            new TrialBalanceDto(
                financeWorkspaceId.Value,
                _clock.UtcNow,
                totalDebit,
                totalCredit,
                totalDebit == totalCredit,
                lines));
    }
}
