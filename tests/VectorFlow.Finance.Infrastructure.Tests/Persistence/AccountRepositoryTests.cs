using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class AccountRepositoryTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 13, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private AccountRepository _repository = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _repository = new AccountRepository(_dbContext);

        _workspaceA = await SeedWorkspaceAsync(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            "Workspace A");
        _workspaceB = await SeedWorkspaceAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            Guid.Parse("44444444-4444-4444-4444-444444444444"),
            "Workspace B");
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Add_and_GetById_persists_account_state()
    {
        var account = Account.Create(
            AccountId.New(),
            _workspaceA,
            " 1000 ",
            "  Operating Cash  ",
            AccountType.Asset,
            T0);

        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccountRepository(readContext).GetByIdAsync(_workspaceA, account.Id);

        Assert.NotNull(loaded);
        Assert.Equal(account.Id, loaded.Id);
        Assert.Equal(_workspaceA, loaded.FinanceWorkspaceId);
        Assert.Equal("1000", loaded.Code.Value);
        Assert.Equal("Operating Cash", loaded.Name);
        Assert.Equal(AccountType.Asset, loaded.Type);
        Assert.Equal(AccountStatus.Active, loaded.Status);
        Assert.Equal(T0, loaded.CreatedAt);
        Assert.Equal(T0, loaded.UpdatedAt);
        Assert.Null(loaded.ArchivedAt);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task GetByWorkspaceAndCode_returns_matching_account_preserving_casing()
    {
        var account = Account.Create(
            AccountId.New(),
            _workspaceA,
            "Cash",
            "Petty Cash",
            AccountType.Asset,
            T0);

        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccountRepository(readContext)
            .GetByWorkspaceAndCodeAsync(_workspaceA, new AccountCode("cash"));

        Assert.NotNull(loaded);
        Assert.Equal(account.Id, loaded.Id);
        Assert.Equal("Cash", loaded.Code.Value);
    }

    [Fact]
    public async Task GetById_wrong_workspace_returns_null()
    {
        var account = Account.Create(
            AccountId.New(),
            _workspaceA,
            "1000",
            "Cash",
            AccountType.Asset,
            T0);

        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        var loaded = await _repository.GetByIdAsync(_workspaceB, account.Id);

        Assert.Null(loaded);
    }

    [Fact]
    public async Task GetByCode_wrong_workspace_returns_null()
    {
        var account = Account.Create(
            AccountId.New(),
            _workspaceA,
            "1000",
            "Cash",
            AccountType.Asset,
            T0);

        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        var loaded = await _repository.GetByWorkspaceAndCodeAsync(_workspaceB, new AccountCode("1000"));

        Assert.Null(loaded);
    }

    [Fact]
    public async Task Same_code_allowed_in_different_workspaces()
    {
        var accountA = Account.Create(AccountId.New(), _workspaceA, "1000", "Cash A", AccountType.Asset, T0);
        var accountB = Account.Create(AccountId.New(), _workspaceB, "1000", "Cash B", AccountType.Asset, T0);

        await _repository.AddAsync(accountA);
        await _repository.AddAsync(accountB);
        await _repository.SaveChangesAsync();

        Assert.NotNull(await _repository.GetByIdAsync(_workspaceA, accountA.Id));
        Assert.NotNull(await _repository.GetByIdAsync(_workspaceB, accountB.Id));
    }

    [Fact]
    public async Task Duplicate_code_same_workspace_rejected_by_database()
    {
        var first = Account.Create(AccountId.New(), _workspaceA, "1000", "First", AccountType.Asset, T0);
        await _repository.AddAsync(first);
        await _repository.SaveChangesAsync();

        await using var secondContext = CreateContext();
        var secondRepository = new AccountRepository(secondContext);
        var second = Account.Create(AccountId.New(), _workspaceA, "1000", "Second", AccountType.Asset, T0);
        await secondRepository.AddAsync(second);

        await Assert.ThrowsAsync<DbUpdateException>(() => secondRepository.SaveChangesAsync());
    }

    [Fact]
    public async Task Duplicate_code_differing_only_by_case_rejected_by_database()
    {
        var first = Account.Create(AccountId.New(), _workspaceA, "Cash", "First", AccountType.Asset, T0);
        await _repository.AddAsync(first);
        await _repository.SaveChangesAsync();

        await using var secondContext = CreateContext();
        var secondRepository = new AccountRepository(secondContext);
        var second = Account.Create(AccountId.New(), _workspaceA, "CASH", "Second", AccountType.Asset, T0);
        await secondRepository.AddAsync(second);

        await Assert.ThrowsAsync<DbUpdateException>(() => secondRepository.SaveChangesAsync());
    }

    [Fact]
    public async Task Archived_account_reserves_code_in_same_workspace()
    {
        var account = Account.Create(AccountId.New(), _workspaceA, "1000", "Cash", AccountType.Asset, T0);
        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        account.Archive(T1);
        await _repository.SaveChangesAsync();

        await using var secondContext = CreateContext();
        var secondRepository = new AccountRepository(secondContext);
        var replacement = Account.Create(AccountId.New(), _workspaceA, "1000", "Replacement", AccountType.Asset, T1);
        await secondRepository.AddAsync(replacement);

        await Assert.ThrowsAsync<DbUpdateException>(() => secondRepository.SaveChangesAsync());
    }

    [Fact]
    public async Task Rename_ChangeCode_ChangeType_and_Archive_persist()
    {
        var account = Account.Create(AccountId.New(), _workspaceA, "1000", "Cash", AccountType.Asset, T0);
        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        account.Rename("Petty Cash", T1);
        account.ChangeCode("1100", T1);
        account.ChangeType(AccountType.Expense, T1);
        account.Archive(T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccountRepository(readContext).GetByIdAsync(_workspaceA, account.Id);

        Assert.NotNull(loaded);
        Assert.Equal("Petty Cash", loaded.Name);
        Assert.Equal("1100", loaded.Code.Value);
        Assert.Equal(AccountType.Expense, loaded.Type);
        Assert.Equal(AccountStatus.Archived, loaded.Status);
        Assert.Equal(T1, loaded.ArchivedAt);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task ChangeCode_to_another_account_code_rejected_by_database()
    {
        var first = Account.Create(AccountId.New(), _workspaceA, "1000", "Cash", AccountType.Asset, T0);
        var second = Account.Create(AccountId.New(), _workspaceA, "1100", "Bank", AccountType.Asset, T0);
        await _repository.AddAsync(first);
        await _repository.AddAsync(second);
        await _repository.SaveChangesAsync();

        first.ChangeCode("1100", T1);

        await Assert.ThrowsAsync<DbUpdateException>(() => _repository.SaveChangesAsync());
    }

    [Fact]
    public async Task Hydrated_account_does_not_regenerate_domain_events()
    {
        var account = Account.Create(AccountId.New(), _workspaceA, "1000", "Cash", AccountType.Asset, T0);
        Assert.NotEmpty(account.DomainEvents);

        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccountRepository(readContext).GetByIdAsync(_workspaceA, account.Id);

        Assert.NotNull(loaded);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task Tracked_update_does_not_insert_duplicate()
    {
        var account = Account.Create(AccountId.New(), _workspaceA, "1000", "Cash", AccountType.Asset, T0);
        await _repository.AddAsync(account);
        await _repository.SaveChangesAsync();

        account.Rename("Renamed Cash", T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var count = await readContext.Accounts.CountAsync(a => a.FinanceWorkspaceId == _workspaceA);
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task Model_contains_Accounts_table_and_unique_code_index()
    {
        var entity = _dbContext.Model.FindEntityType(typeof(Account));
        Assert.NotNull(entity);
        Assert.Equal("Accounts", entity.GetTableName());

        var uniqueIndex = entity.GetIndexes().Single(index => index.IsUnique);
        var indexProperties = uniqueIndex.Properties.Select(property => property.Name).ToArray();
        Assert.Equal(new[] { "FinanceWorkspaceId", "CodeNormalized" }, indexProperties);
        Assert.Equal("IX_Accounts_FinanceWorkspaceId_CodeNormalized", uniqueIndex.GetDatabaseName());
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

    private FinanceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<FinanceDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new FinanceDbContext(options);
    }
}
