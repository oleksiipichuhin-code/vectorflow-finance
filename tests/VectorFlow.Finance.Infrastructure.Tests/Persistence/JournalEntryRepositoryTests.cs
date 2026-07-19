using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class JournalEntryRepositoryTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 13, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 14, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private JournalEntryRepository _repository = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;
    private AccountId _cashA;
    private AccountId _revenueA;
    private AccountId _cashB;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _repository = new JournalEntryRepository(_dbContext);

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
        _cashB = await SeedAccountAsync(_workspaceB, "1000", "Cash B");
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Add_and_GetById_round_trips_journal_entry()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Opening", T0);

        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);

        Assert.NotNull(loaded);
        Assert.Equal(entry.Id, loaded.Id);
        Assert.Equal(_workspaceA, loaded.FinanceWorkspaceId);
        Assert.Equal("Opening", loaded.Name);
        Assert.Equal(JournalEntryStatus.Draft, loaded.Status);
        Assert.Equal(T0, loaded.CreatedAt);
        Assert.Equal(T0, loaded.UpdatedAt);
        Assert.Null(loaded.PostedAt);
        Assert.Empty(loaded.Lines);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task Multiple_lines_round_trip_with_sequence_and_amounts()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Sale", T0);
        entry.AddLine(_cashA, 100.1234m, 0m, "Cash", T0);
        entry.AddLine(_revenueA, 0m, 100.1234m, "Revenue", T0);

        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);

        Assert.NotNull(loaded);
        Assert.Equal(2, loaded.Lines.Count);
        Assert.Equal(100.1234m, loaded.Lines.Single(line => line.Sequence == 1).Debit);
        Assert.Equal(100.1234m, loaded.Lines.Single(line => line.Sequence == 2).Credit);
        Assert.Equal(_cashA, loaded.Lines.Single(line => line.Sequence == 1).FinancialAccountId);
        Assert.Equal("Cash", loaded.Lines.Single(line => line.Sequence == 1).Description);
    }

    [Fact]
    public async Task Status_and_PostedAt_round_trip()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Balanced", T0);
        entry.AddLine(_cashA, 50m, 0m, null, T0);
        entry.AddLine(_revenueA, 0m, 50m, null, T0);
        entry.Post(T1);

        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);

        Assert.NotNull(loaded);
        Assert.Equal(JournalEntryStatus.Posted, loaded.Status);
        Assert.Equal(T1, loaded.PostedAt);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task Debit_credit_precision_round_trip()
    {
        var amount = 123456789.123456789m;
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Precision", T0);
        entry.AddLine(_cashA, amount, 0m, null, T0);
        entry.AddLine(_revenueA, 0m, amount, null, T0);

        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);

        Assert.NotNull(loaded);
        Assert.Equal(amount, loaded.TotalDebit);
        Assert.Equal(amount, loaded.TotalCredit);
    }

    [Fact]
    public async Task GetById_wrong_workspace_returns_null()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Scoped", T0);
        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        var loaded = await _repository.GetByIdAsync(_workspaceB, entry.Id);

        Assert.Null(loaded);
    }

    [Fact]
    public async Task ListByWorkspace_returns_only_workspace_newest_first()
    {
        var older = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Older", T0);
        var newer = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Newer", T1);
        var other = JournalEntry.Create(JournalEntryId.New(), _workspaceB, "Other", T2);

        await _repository.AddAsync(older);
        await _repository.AddAsync(newer);
        await _repository.AddAsync(other);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new JournalEntryRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(2, listed.Count);
        Assert.Equal(newer.Id, listed[0].Id);
        Assert.Equal(older.Id, listed[1].Id);
    }

    [Fact]
    public async Task Line_update_persists()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Update line", T0);
        var line = entry.AddLine(_cashA, 10m, 0m, "Old", T0);
        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        entry.UpdateLine(line.Id, _revenueA, 0m, 20m, "New", T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);

        Assert.NotNull(loaded);
        var updated = Assert.Single(loaded.Lines);
        Assert.Equal(_revenueA, updated.FinancialAccountId);
        Assert.Equal(0m, updated.Debit);
        Assert.Equal(20m, updated.Credit);
        Assert.Equal("New", updated.Description);
        Assert.Equal(T1, loaded.UpdatedAt);
    }

    [Fact]
    public async Task Line_removal_persists()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Remove line", T0);
        var keep = entry.AddLine(_cashA, 10m, 0m, "Keep", T0);
        var remove = entry.AddLine(_revenueA, 0m, 10m, "Remove", T0);
        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        entry.RemoveLine(remove.Id, T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);

        Assert.NotNull(loaded);
        var remaining = Assert.Single(loaded.Lines);
        Assert.Equal(keep.Id, remaining.Id);
        Assert.Equal(1, await readContext.JournalEntryLines.CountAsync());
    }

    [Fact]
    public async Task Foreign_workspace_account_fk_is_allowed_at_db_level_but_app_rejects()
    {
        // DB FK only ensures Account exists; same-workspace is Application responsibility.
        var entry = JournalEntry.Create(JournalEntryId.New(), _workspaceA, "Cross account", T0);
        entry.AddLine(_cashB, 10m, 0m, null, T0);

        await _repository.AddAsync(entry);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new JournalEntryRepository(readContext).GetByIdAsync(_workspaceA, entry.Id);
        Assert.NotNull(loaded);
        Assert.Equal(_cashB, Assert.Single(loaded.Lines).FinancialAccountId);
    }

    [Fact]
    public async Task Model_contains_journal_entry_tables_and_indexes()
    {
        var entryEntity = _dbContext.Model.FindEntityType(typeof(JournalEntry));
        var lineEntity = _dbContext.Model.FindEntityType(typeof(JournalEntryLine));

        Assert.NotNull(entryEntity);
        Assert.Equal("JournalEntries", entryEntity.GetTableName());
        Assert.NotNull(lineEntity);
        Assert.Equal("JournalEntryLines", lineEntity.GetTableName());

        Assert.Contains(
            entryEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_JournalEntries_FinanceWorkspaceId");
        Assert.Contains(
            lineEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_JournalEntryLines_JournalEntryId_Sequence"
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
}
