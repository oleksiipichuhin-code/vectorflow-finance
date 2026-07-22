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
    /// together with the total matching count. Optional <paramref name="status"/>, optional
    /// <paramref name="documentNumber"/> (exact ordinal match), and optional
    /// <paramref name="counterpartyReference"/> (exact ordinal match) are applied in the query; inclusive
    /// CreatedAt bounds (<paramref name="createdFromUtc"/> / <paramref name="createdToUtc"/>) are applied
    /// in memory after materialization (SQLite cannot translate DateTimeOffset comparisons). All filters
    /// apply to the page and the total count. A null <paramref name="documentNumber"/> means no
    /// DocumentNumber filter (positive exact match only when provided; no partial/full-text mode).
    /// A null <paramref name="counterpartyReference"/> means no CounterpartyReference filter
    /// (positive exact match only when provided; no partial/full-text mode).
    /// </summary>
    Task<(IReadOnlyList<Invoice> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        InvoiceStatus? status = null,
        DateTimeOffset? createdFromUtc = null,
        DateTimeOffset? createdToUtc = null,
        string? documentNumber = null,
        string? counterpartyReference = null,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Invoice invoice,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
