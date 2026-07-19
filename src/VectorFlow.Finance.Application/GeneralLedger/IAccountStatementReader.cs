using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.GeneralLedger;

/// <summary>
/// Read-only projection of a general-ledger account statement from ledger postings.
/// </summary>
public interface IAccountStatementReader
{
    /// <summary>
    /// Returns the statement for the account in the workspace, or <c>null</c> when the account
    /// does not exist in that workspace.
    /// </summary>
    Task<AccountStatementDto?> GetAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId accountId,
        DateTimeOffset? periodFromUtc,
        DateTimeOffset? periodToUtc,
        CancellationToken cancellationToken = default);
}
