using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accounts;

/// <summary>
/// Persistence port for chart-of-accounts accounts. Implementation belongs to Infrastructure (F2C).
/// All reads are workspace-scoped to prevent cross-workspace access.
/// </summary>
public interface IAccountRepository
{
    Task<Account?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId id,
        CancellationToken cancellationToken = default);

    Task<Account?> GetByWorkspaceAndCodeAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountCode code,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Account account,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
