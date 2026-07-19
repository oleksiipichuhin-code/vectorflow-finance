using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.AccountBalances.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.AccountBalances.Handlers;

public sealed class GetAccountBalancesHandler
{
    private readonly IAccountBalanceReader _reader;

    public GetAccountBalancesHandler(IAccountBalanceReader reader)
    {
        _reader = reader;
    }

    public async Task<ApplicationResult<IReadOnlyList<AccountBalanceSummaryDto>>> HandleAsync(
        GetAccountBalancesQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<AccountBalanceSummaryDto>>.ValidationFailed(ex.Message);
        }

        var balances = await _reader.ListByWorkspaceAsync(financeWorkspaceId, cancellationToken);
        return ApplicationResult<IReadOnlyList<AccountBalanceSummaryDto>>.Success(balances);
    }
}
