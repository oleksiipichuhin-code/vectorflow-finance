using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals;

/// <summary>
/// Persistence port for accruals. Implementation belongs to Infrastructure (later slice).
/// All reads are workspace-scoped to prevent cross-workspace access.
/// </summary>
public interface IAccrualRepository
{
    Task<Accrual?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccrualId id,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns accruals for the workspace ordered by CreatedAt descending, then Id descending.
    /// </summary>
    Task<IReadOnlyList<Accrual>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns a workspace-scoped page of accruals ordered by CreatedAt descending, then Id descending,
    /// together with the total matching count. CreatedAt ordering and Skip/Take run in memory
    /// (SQLite cannot ORDER BY DateTimeOffset).
    /// </summary>
    Task<(IReadOnlyList<Accrual> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns accruals for the workspace with the given source invoice id,
    /// ordered by CreatedAt descending, then Id descending.
    /// </summary>
    Task<IReadOnlyList<Accrual>> ListBySourceInvoiceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceId sourceInvoiceId,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Accrual accrual,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
