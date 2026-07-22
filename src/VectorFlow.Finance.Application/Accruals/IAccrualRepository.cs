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
    /// together with the total matching count. Optional <paramref name="status"/>, optional
    /// <paramref name="sourceInvoiceId"/>, and optional <paramref name="type"/> are applied in the query;
    /// inclusive CreatedAt bounds (<paramref name="createdFromUtc"/> / <paramref name="createdToUtc"/>)
    /// and inclusive RecognitionDate bounds (<paramref name="recognitionFromUtc"/> /
    /// <paramref name="recognitionToUtc"/>) are applied in memory after materialization (SQLite cannot
    /// translate DateTimeOffset comparisons). All filters apply to the page and the total count. A null
    /// <paramref name="sourceInvoiceId"/> means no SourceInvoiceId filter (positive match only when
    /// provided; no IS NULL mode). A null <paramref name="type"/> means no Type filter.
    /// </summary>
    Task<(IReadOnlyList<Accrual> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        AccrualStatus? status = null,
        DateTimeOffset? createdFromUtc = null,
        DateTimeOffset? createdToUtc = null,
        InvoiceId? sourceInvoiceId = null,
        AccrualType? type = null,
        DateTimeOffset? recognitionFromUtc = null,
        DateTimeOffset? recognitionToUtc = null,
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
