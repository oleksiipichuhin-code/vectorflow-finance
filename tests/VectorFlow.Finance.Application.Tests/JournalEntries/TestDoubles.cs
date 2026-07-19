using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.JournalEntries;

internal sealed class InMemoryJournalEntryRepository : IJournalEntryRepository
{
    private readonly Dictionary<Guid, JournalEntry> _byId = new();

    public int SaveChangesCallCount { get; private set; }

    public int AddCallCount { get; private set; }

    public Task<JournalEntry?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId id,
        CancellationToken cancellationToken = default)
    {
        if (_byId.TryGetValue(id.Value, out var entry)
            && entry.FinanceWorkspaceId == financeWorkspaceId)
        {
            return Task.FromResult<JournalEntry?>(entry);
        }

        return Task.FromResult<JournalEntry?>(null);
    }

    public Task<IReadOnlyList<JournalEntry>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<JournalEntry> entries = _byId.Values
            .Where(entry => entry.FinanceWorkspaceId == financeWorkspaceId)
            .OrderByDescending(entry => entry.CreatedAt)
            .ThenByDescending(entry => entry.Id.Value)
            .ToList();

        return Task.FromResult(entries);
    }

    public Task AddAsync(JournalEntry entry, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        _byId[entry.Id.Value] = entry;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveChangesCallCount++;
        return Task.CompletedTask;
    }
}
