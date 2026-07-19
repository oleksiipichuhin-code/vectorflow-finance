using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Ledger;

/// <summary>
/// Persistence port for ledger postings. Implementation belongs to Infrastructure (F3E).
/// All reads are workspace-scoped to prevent cross-workspace access.
/// </summary>
public interface ILedgerPostingRepository
{
    Task<LedgerPosting?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        LedgerPostingId id,
        CancellationToken cancellationToken = default);

    Task<LedgerPosting?> GetByJournalEntryIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId journalEntryId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns ledger postings for the workspace ordered by PostedAtUtc descending, then Id descending.
    /// </summary>
    Task<IReadOnlyList<LedgerPosting>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        LedgerPosting posting,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
