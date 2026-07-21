using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices;

/// <summary>
/// Persistence port for invoices. Implementation belongs to Infrastructure (later slice).
/// All reads are workspace-scoped to prevent cross-workspace access.
/// </summary>
public interface IInvoiceRepository
{
    Task<Invoice?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceId id,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns invoices for the workspace ordered by CreatedAt descending, then Id descending.
    /// </summary>
    Task<IReadOnlyList<Invoice>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns invoices for the workspace with the given document number (exact ordinal match),
    /// ordered by CreatedAt descending, then Id descending.
    /// </summary>
    Task<IReadOnlyList<Invoice>> ListByDocumentNumberAsync(
        FinanceWorkspaceId financeWorkspaceId,
        string documentNumber,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns a workspace-scoped page of invoices ordered by CreatedAt descending, then Id descending,
    /// together with the total matching count. Optional <paramref name="status"/> is applied in the
    /// query; inclusive CreatedAt bounds (<paramref name="createdFromUtc"/> / <paramref name="createdToUtc"/>)
    /// are applied in memory after materialization (SQLite cannot translate DateTimeOffset comparisons).
    /// Both filters apply to the page and the total count.
    /// </summary>
    Task<(IReadOnlyList<Invoice> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        InvoiceStatus? status = null,
        DateTimeOffset? createdFromUtc = null,
        DateTimeOffset? createdToUtc = null,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Invoice invoice,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
