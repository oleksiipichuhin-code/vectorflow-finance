using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.AccountBalances;

internal sealed class InMemoryAccountBalanceReader : IAccountBalanceReader
{
    private readonly Dictionary<(Guid WorkspaceId, Guid AccountId), AccountBalanceDto> _balances = new();

    public void Seed(Guid workspaceId, AccountBalanceDto balance) =>
        _balances[(workspaceId, balance.AccountId)] = balance;

    public void SeedSummary(Guid workspaceId, AccountBalanceSummaryDto summary) =>
        _balances[(workspaceId, summary.AccountId)] = new AccountBalanceDto(
            summary.AccountId,
            summary.AccountCode,
            summary.AccountName,
            summary.DebitTotal,
            summary.CreditTotal,
            summary.Balance,
            summary.BalanceSide);

    public Task<AccountBalanceDto?> GetByAccountIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        if (_balances.TryGetValue((financeWorkspaceId.Value, accountId.Value), out var balance))
        {
            return Task.FromResult<AccountBalanceDto?>(balance);
        }

        return Task.FromResult<AccountBalanceDto?>(null);
    }

    public Task<IReadOnlyList<AccountBalanceSummaryDto>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<AccountBalanceSummaryDto> balances = _balances
            .Where(pair => pair.Key.WorkspaceId == financeWorkspaceId.Value)
            .Select(pair => pair.Value)
            .OrderBy(balance => balance.AccountCode, StringComparer.Ordinal)
            .ThenBy(balance => balance.AccountId)
            .Select(balance => new AccountBalanceSummaryDto(
                balance.AccountId,
                balance.AccountCode,
                balance.AccountName,
                balance.DebitTotal,
                balance.CreditTotal,
                balance.Balance,
                balance.BalanceSide))
            .ToArray();

        return Task.FromResult(balances);
    }
}
