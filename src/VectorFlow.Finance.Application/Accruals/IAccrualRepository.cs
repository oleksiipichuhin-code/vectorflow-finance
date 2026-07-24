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
    /// <paramref name="sourceInvoiceId"/>, optional <paramref name="type"/>, optional
    /// <paramref name="currency"/> (exact Ordinal match on normalized Currency.Code), optional
    /// <paramref name="description"/> (exact Ordinal match after Description trim/normalization), optional
    /// <paramref name="descriptionPrefix"/> (case-sensitive Ordinal prefix match after Description
    /// trim/normalization; SQL <c>substr</c> equality, not LIKE/StartsWith), and optional
    /// <paramref name="reversalReason"/> (exact Ordinal match after ReversalReason trim/normalization) are
    /// applied in the query; inclusive CreatedAt bounds (<paramref name="createdFromUtc"/> /
    /// <paramref name="createdToUtc"/>), inclusive RecognitionDate bounds (<paramref name="recognitionFromUtc"/> /
    /// <paramref name="recognitionToUtc"/>), inclusive Amount bounds (<paramref name="amountFrom"/> /
    /// <paramref name="amountTo"/>), inclusive RecognizedAt bounds (<paramref name="recognizedFromUtc"/> /
    /// <paramref name="recognizedToUtc"/>), and inclusive ReversedAt bounds (<paramref name="reversedFromUtc"/> /
    /// <paramref name="reversedToUtc"/>) are applied in memory after materialization (SQLite cannot translate
    /// DateTimeOffset comparisons; Amount, RecognizedAt, and ReversedAt bounds stay with the existing
    /// in-memory filter stage). When any RecognizedAt bound is present, accruals with null RecognizedAt
    /// are excluded. When any ReversedAt bound is present, accruals with null ReversedAt are excluded.
    /// All filters apply to the page and the total count. A null <paramref name="sourceInvoiceId"/> means
    /// no SourceInvoiceId filter (positive match only when provided; no IS NULL mode). A null
    /// <paramref name="type"/> means no Type filter. A null <paramref name="currency"/> means no Currency
    /// filter (positive exact match only when provided; no partial/full-text mode). A null
    /// <paramref name="amountFrom"/> / <paramref name="amountTo"/> means no that Amount bound. A null
    /// <paramref name="description"/> means no Description filter (positive exact match only when provided;
    /// no partial/prefix/case-insensitive/full-text mode). A null <paramref name="descriptionPrefix"/> means
    /// no Description prefix filter (positive case-sensitive Ordinal prefix match only when provided; no
    /// contains/case-insensitive/full-text mode; literal treatment of wildcard-like characters). A null
    /// <paramref name="recognizedFromUtc"/> / <paramref name="recognizedToUtc"/> means no that RecognizedAt
    /// bound. A null <paramref name="reversedFromUtc"/> / <paramref name="reversedToUtc"/> means no that
    /// ReversedAt bound. A null <paramref name="reversalReason"/> means no ReversalReason filter (positive
    /// exact match only when provided; null ReversalReason rows do not match; no partial/prefix/
    /// case-insensitive/full-text mode). When both <paramref name="description"/> and
    /// <paramref name="descriptionPrefix"/> are provided, they compose under AND.
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
        string? currency = null,
        decimal? amountFrom = null,
        decimal? amountTo = null,
        string? description = null,
        string? descriptionPrefix = null,
        DateTimeOffset? recognizedFromUtc = null,
        DateTimeOffset? recognizedToUtc = null,
        DateTimeOffset? reversedFromUtc = null,
        DateTimeOffset? reversedToUtc = null,
        string? reversalReason = null,
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
