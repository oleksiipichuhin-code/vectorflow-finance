using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Ledger;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class LedgerPostingRepository : ILedgerPostingRepository
{
    private readonly FinanceDbContext _dbContext;

    public LedgerPostingRepository(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<LedgerPosting?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        LedgerPostingId id,
        CancellationToken cancellationToken = default) =>
        PostingsWithLines()
            .SingleOrDefaultAsync(
                posting =>
                    posting.FinanceWorkspaceId == financeWorkspaceId &&
                    posting.Id == id,
                cancellationToken);

    public Task<LedgerPosting?> GetByJournalEntryIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId journalEntryId,
        CancellationToken cancellationToken = default) =>
        PostingsWithLines()
            .SingleOrDefaultAsync(
                posting =>
                    posting.FinanceWorkspaceId == financeWorkspaceId &&
                    posting.JournalEntryId == journalEntryId,
                cancellationToken);

    public async Task<IReadOnlyList<LedgerPosting>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        var postings = await PostingsWithLines()
            .Where(posting => posting.FinanceWorkspaceId == financeWorkspaceId)
            .ToListAsync(cancellationToken);

        return postings
            .OrderByDescending(posting => posting.PostedAtUtc)
            .ThenByDescending(posting => posting.Id.Value)
            .ToList();
    }

    public async Task AddAsync(
        LedgerPosting posting,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.LedgerPostings.AddAsync(posting, cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
        {
            throw new UniqueConstraintViolationException(
                "A unique constraint was violated while saving ledger posting data.",
                ex);
        }
    }

    private IQueryable<LedgerPosting> PostingsWithLines() =>
        _dbContext.LedgerPostings
            .Include(posting => posting.Lines);

    private static bool IsUniqueConstraintViolation(DbUpdateException exception)
    {
        var message = exception.InnerException?.Message ?? exception.Message;
        return message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase)
               || message.Contains("unique constraint", StringComparison.OrdinalIgnoreCase);
    }
}
