using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Ledger;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class LedgerPostingRepositoryTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 13, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 14, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private LedgerPostingRepository _repository = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;
    private AccountId _cashA;
    private AccountId _revenueA;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _repository = new LedgerPostingRepository(_dbContext);

        _workspaceA = await SeedWorkspaceAsync(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            "Workspace A");
        _workspaceB = await SeedWorkspaceAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            Guid.Parse("44444444-4444-4444-4444-444444444444"),
            "Workspace B");

        _cashA = await SeedAccountAsync(_workspaceA, "1000", "Cash A");
        _revenueA = await SeedAccountAsync(_workspaceA, "4000", "Revenue A", AccountType.Revenue);
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Round_trip_posting_with_lines_and_decimals()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 100.25m, T0, T1);
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), journal);

        await _repository.AddAsync(posting);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new LedgerPostingRepository(readContext)
            .GetByIdAsync(_workspaceA, posting.Id);

        Assert.NotNull(loaded);
        Assert.Equal(posting.Id, loaded.Id);
        Assert.Equal(_workspaceA, loaded.FinanceWorkspaceId);
        Assert.Equal(journal.Id, loaded.JournalEntryId);
        Assert.Equal(T1, loaded.PostedAtUtc);
        Assert.Equal(2, loaded.Lines.Count);
        Assert.Equal(100.25m, loaded.TotalDebit);
        Assert.Equal(100.25m, loaded.TotalCredit);
        Assert.Equal(journal.Lines[0].Id, loaded.Lines.Single(l => l.Sequence == 1).SourceJournalEntryLineId);
        Assert.Equal("Cash", loaded.Lines.Single(l => l.Sequence == 1).Description);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task GetByJournalEntryId_and_workspace_isolation()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 50m, T0, T1);
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), journal);
        await _repository.AddAsync(posting);
        await _repository.SaveChangesAsync();

        var byJournal = await _repository.GetByJournalEntryIdAsync(_workspaceA, journal.Id);
        Assert.NotNull(byJournal);
        Assert.Equal(posting.Id, byJournal.Id);

        Assert.Null(await _repository.GetByIdAsync(_workspaceB, posting.Id));
        Assert.Null(await _repository.GetByJournalEntryIdAsync(_workspaceB, journal.Id));
    }

    [Fact]
    public async Task ListByWorkspace_newest_first()
    {
        var olderJournal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T1);
        var newerJournal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 20m, T0, T2);
        var otherCash = await SeedAccountAsync(_workspaceB, "1000", "Cash B");
        var otherRevenue = await SeedAccountAsync(_workspaceB, "4000", "Revenue B", AccountType.Revenue);
        var otherJournal = await SeedPostedJournalAsync(_workspaceB, otherCash, otherRevenue, 5m, T0, T2);

        await _repository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), olderJournal));
        await _repository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), newerJournal));
        await _repository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), otherJournal));
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new LedgerPostingRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(2, listed.Count);
        Assert.Equal(T2, listed[0].PostedAtUtc);
        Assert.Equal(T1, listed[1].PostedAtUtc);
    }

    [Fact]
    public async Task Duplicate_JournalEntryId_is_rejected()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T1);
        await _repository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), journal));
        await _repository.SaveChangesAsync();

        await using var secondContext = CreateContext();
        var secondRepository = new LedgerPostingRepository(secondContext);
        await secondRepository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), journal));

        await Assert.ThrowsAsync<UniqueConstraintViolationException>(
            () => secondRepository.SaveChangesAsync());
    }

    [Fact]
    public async Task Restrict_prevents_deleting_journal_entry_with_posting()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T1);
        await _repository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), journal));
        await _repository.SaveChangesAsync();

        // EF client cascade for required Restrict FKs throws before SaveChanges; assert DB FK Restrict via SQL.
        var exception = await Assert.ThrowsAsync<SqliteException>(() =>
            _dbContext.Database.ExecuteSqlRawAsync(
                "DELETE FROM JournalEntries WHERE Id = {0}",
                journal.Id.Value));

        Assert.Contains("FOREIGN KEY", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, await _dbContext.LedgerPostings.CountAsync());
    }

    [Fact]
    public async Task Restrict_prevents_deleting_account_used_by_posting_line()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T1);
        await _repository.AddAsync(LedgerPosting.CreateFrom(LedgerPostingId.New(), journal));
        await _repository.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<SqliteException>(() =>
            _dbContext.Database.ExecuteSqlRawAsync(
                "DELETE FROM Accounts WHERE Id = {0}",
                _cashA.Value));

        Assert.Contains("FOREIGN KEY", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(1, await _dbContext.LedgerPostings.CountAsync());
    }

    [Fact]
    public async Task Duplicate_source_line_id_within_posting_is_rejected()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T1);
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), journal);
        await _repository.AddAsync(posting);
        await _repository.SaveChangesAsync();

        var sourceLineId = posting.Lines[0].SourceJournalEntryLineId.Value;
        var exception = await Assert.ThrowsAsync<SqliteException>(() =>
            _dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO LedgerPostingLines
                (Id, SourceJournalEntryLineId, FinancialAccountId, Debit, Credit, Description, Sequence, LedgerPostingId)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7})
                """,
                Guid.NewGuid(),
                sourceLineId,
                _cashA.Value,
                1m,
                0m,
                "dup",
                99,
                posting.Id.Value));

        Assert.Contains("UNIQUE", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Duplicate_sequence_within_posting_is_rejected()
    {
        var journal = await SeedPostedJournalAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T1);
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), journal);
        await _repository.AddAsync(posting);
        await _repository.SaveChangesAsync();

        var exception = await Assert.ThrowsAsync<SqliteException>(() =>
            _dbContext.Database.ExecuteSqlRawAsync(
                """
                INSERT INTO LedgerPostingLines
                (Id, SourceJournalEntryLineId, FinancialAccountId, Debit, Credit, Description, Sequence, LedgerPostingId)
                VALUES ({0}, {1}, {2}, {3}, {4}, {5}, {6}, {7})
                """,
                Guid.NewGuid(),
                Guid.NewGuid(),
                _cashA.Value,
                1m,
                0m,
                "dup-seq",
                1,
                posting.Id.Value));

        Assert.Contains("UNIQUE", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Model_contains_unique_indexes()
    {
        var postingEntity = _dbContext.Model.FindEntityType(typeof(LedgerPosting));
        var lineEntity = _dbContext.Model.FindEntityType(typeof(LedgerPostingLine));
        Assert.NotNull(postingEntity);
        Assert.NotNull(lineEntity);
        Assert.Equal("LedgerPostings", postingEntity.GetTableName());
        Assert.Equal("LedgerPostingLines", lineEntity.GetTableName());

        Assert.Contains(
            postingEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_LedgerPostings_JournalEntryId" && index.IsUnique);
        Assert.Contains(
            lineEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_LedgerPostingLines_LedgerPostingId_SourceJournalEntryLineId"
                     && index.IsUnique);
        Assert.Contains(
            lineEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_LedgerPostingLines_LedgerPostingId_Sequence"
                     && index.IsUnique);
    }

    private FinanceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<FinanceDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new FinanceDbContext(options);
    }

    private async Task<FinanceWorkspaceId> SeedWorkspaceAsync(
        Guid organizationId,
        Guid platformWorkspaceId,
        string name)
    {
        var workspace = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            new PlatformOrganizationId(organizationId),
            new PlatformWorkspaceId(platformWorkspaceId),
            name,
            "UAH",
            T0);

        _dbContext.FinanceWorkspaces.Add(workspace);
        await _dbContext.SaveChangesAsync();
        return workspace.Id;
    }

    private async Task<AccountId> SeedAccountAsync(
        FinanceWorkspaceId workspaceId,
        string code,
        string name,
        AccountType type = AccountType.Asset)
    {
        var account = Account.Create(AccountId.New(), workspaceId, code, name, type, T0);
        _dbContext.Accounts.Add(account);
        await _dbContext.SaveChangesAsync();
        return account.Id;
    }

    private async Task<JournalEntry> SeedPostedJournalAsync(
        FinanceWorkspaceId workspaceId,
        AccountId cash,
        AccountId revenue,
        decimal amount,
        DateTimeOffset createdAt,
        DateTimeOffset postedAt)
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), workspaceId, "Sale", createdAt);
        entry.AddLine(cash, amount, 0m, "Cash", createdAt);
        entry.AddLine(revenue, 0m, amount, "Revenue", createdAt);
        entry.Post(postedAt);
        _dbContext.JournalEntries.Add(entry);
        await _dbContext.SaveChangesAsync();
        return entry;
    }
}
