using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.AccountBalances.Queries;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.AccountBalances.Handlers;

public sealed class GetAccountBalanceHandler
{
    private readonly IAccountBalanceReader _reader;

    public GetAccountBalanceHandler(IAccountBalanceReader reader)
    {
        _reader = reader;
    }

    public async Task<ApplicationResult<AccountBalanceDto>> HandleAsync(
        GetAccountBalanceQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccountId accountId;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            accountId = new AccountId(query.AccountId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountBalanceDto>.ValidationFailed(ex.Message);
        }

        var balance = await _reader.GetByAccountIdAsync(financeWorkspaceId, accountId, cancellationToken);
        if (balance is null)
        {
            return ApplicationResult<AccountBalanceDto>.NotFound("Account was not found.");
        }

        return ApplicationResult<AccountBalanceDto>.Success(balance);
    }
}
