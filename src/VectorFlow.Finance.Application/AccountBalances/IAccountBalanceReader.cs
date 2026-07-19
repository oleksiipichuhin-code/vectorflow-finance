using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.AccountBalances;

/// <summary>
/// Read-only projection of account balances from ledger postings.
/// </summary>
public interface IAccountBalanceReader
{
    Task<AccountBalanceDto?> GetByAccountIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId accountId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns balances for all accounts in the workspace (zero when no posting activity),
    /// ordered by account code ascending.
    /// </summary>
    Task<IReadOnlyList<AccountBalanceSummaryDto>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default);
}
