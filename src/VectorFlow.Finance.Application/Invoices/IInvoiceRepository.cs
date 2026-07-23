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
    /// <paramref name="documentNumber"/> (exact ordinal match), optional
    /// <paramref name="counterpartyReference"/> (exact ordinal match), and optional
    /// <paramref name="currency"/> (exact Ordinal match on normalized Currency.Code) are applied in the
    /// query; inclusive CreatedAt bounds (<paramref name="createdFromUtc"/> / <paramref name="createdToUtc"/>)
    /// and inclusive IssuedAt bounds (<paramref name="issuedFromUtc"/> / <paramref name="issuedToUtc"/>)
    /// and inclusive DueDate bounds (<paramref name="dueFromUtc"/> / <paramref name="dueToUtc"/>)
    /// and inclusive TotalAmount bounds (<paramref name="totalAmountFrom"/> / <paramref name="totalAmountTo"/>)
    /// are applied in memory after materialization (SQLite cannot translate DateTimeOffset comparisons;
    /// TotalAmount is a computed non-persisted projection over loaded lines).
    /// When any IssuedAt bound is present, invoices with null IssuedAt are excluded. When any DueDate
    /// bound is present, invoices with null DueDate are excluded. TotalAmount bounds compare the numeric
    /// magnitude of <c>Invoice.TotalAmount</c> independently of Currency (same posture as Accrual Amount
    /// range; optional Currency filter remains a separate AND predicate). All filters apply to the page
    /// and the total count. A null <paramref name="documentNumber"/> means no DocumentNumber filter
    /// (positive exact match only when provided; no partial/full-text mode). A null
    /// <paramref name="counterpartyReference"/> means no CounterpartyReference filter (positive exact match
    /// only when provided; no partial/full-text mode). A null <paramref name="currency"/> means no Currency
    /// filter (positive exact match only when provided; no partial/full-text mode). A null
    /// <paramref name="issuedFromUtc"/> / <paramref name="issuedToUtc"/> means no that IssuedAt bound. A
    /// null <paramref name="dueFromUtc"/> / <paramref name="dueToUtc"/> means no that DueDate bound. A null
    /// <paramref name="totalAmountFrom"/> / <paramref name="totalAmountTo"/> means no that TotalAmount bound.
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
        string? currency = null,
        DateTimeOffset? issuedFromUtc = null,
        DateTimeOffset? issuedToUtc = null,
        DateTimeOffset? dueFromUtc = null,
        DateTimeOffset? dueToUtc = null,
        decimal? totalAmountFrom = null,
        decimal? totalAmountTo = null,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Invoice invoice,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
