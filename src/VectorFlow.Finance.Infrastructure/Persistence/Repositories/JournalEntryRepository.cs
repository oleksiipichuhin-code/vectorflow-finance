using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class JournalEntryRepository : IJournalEntryRepository
{
    private readonly FinanceDbContext _dbContext;

    public JournalEntryRepository(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<JournalEntry?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId id,
        CancellationToken cancellationToken = default) =>
        EntriesWithLines()
            .SingleOrDefaultAsync(
                entry =>
                    entry.FinanceWorkspaceId == financeWorkspaceId &&
                    entry.Id == id,
                cancellationToken);

    public async Task<IReadOnlyList<JournalEntry>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        var entries = await EntriesWithLines()
            .Where(entry => entry.FinanceWorkspaceId == financeWorkspaceId)
            .ToListAsync(cancellationToken);

        return entries
            .OrderByDescending(entry => entry.CreatedAt)
            .ThenByDescending(entry => entry.Id.Value)
            .ToList();
    }

    public async Task AddAsync(
        JournalEntry entry,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.JournalEntries.AddAsync(entry, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _dbContext.SaveChangesAsync(cancellationToken);

    private IQueryable<JournalEntry> EntriesWithLines() =>
        _dbContext.JournalEntries
            .Include(entry => entry.Lines);
}
