using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.JournalEntries;

/// <summary>
/// Persistence port for journal entries. Implementation belongs to Infrastructure (F3B).
/// All reads are workspace-scoped to prevent cross-workspace access.
/// </summary>
public interface IJournalEntryRepository
{
    Task<JournalEntry?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId id,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns journal entries for the workspace ordered by CreatedAt descending, then Id descending.
    /// </summary>
    Task<IReadOnlyList<JournalEntry>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        JournalEntry entry,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
