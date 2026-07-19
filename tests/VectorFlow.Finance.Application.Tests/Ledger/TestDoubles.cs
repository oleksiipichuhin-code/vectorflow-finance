using VectorFlow.Finance.Application.Ledger;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Ledger;

internal sealed class InMemoryLedgerPostingRepository : ILedgerPostingRepository
{
    private readonly Dictionary<Guid, LedgerPosting> _byId = new();

    public int SaveChangesCallCount { get; private set; }

    public int AddCallCount { get; private set; }

    public bool ThrowOnSaveChanges { get; set; }

    public Task<LedgerPosting?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        LedgerPostingId id,
        CancellationToken cancellationToken = default)
    {
        if (_byId.TryGetValue(id.Value, out var posting)
            && posting.FinanceWorkspaceId == financeWorkspaceId)
        {
            return Task.FromResult<LedgerPosting?>(posting);
        }

        return Task.FromResult<LedgerPosting?>(null);
    }

    public Task<LedgerPosting?> GetByJournalEntryIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId journalEntryId,
        CancellationToken cancellationToken = default)
    {
        var posting = _byId.Values.FirstOrDefault(candidate =>
            candidate.FinanceWorkspaceId == financeWorkspaceId
            && candidate.JournalEntryId == journalEntryId);

        return Task.FromResult(posting);
    }

    public Task<IReadOnlyList<LedgerPosting>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        IReadOnlyList<LedgerPosting> postings = _byId.Values
            .Where(posting => posting.FinanceWorkspaceId == financeWorkspaceId)
            .OrderByDescending(posting => posting.PostedAtUtc)
            .ThenByDescending(posting => posting.Id.Value)
            .ToList();

        return Task.FromResult(postings);
    }

    public Task AddAsync(LedgerPosting posting, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        _byId[posting.Id.Value] = posting;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        if (ThrowOnSaveChanges)
        {
            throw new InvalidOperationException("Simulated repository save failure.");
        }

        SaveChangesCallCount++;
        return Task.CompletedTask;
    }
}
