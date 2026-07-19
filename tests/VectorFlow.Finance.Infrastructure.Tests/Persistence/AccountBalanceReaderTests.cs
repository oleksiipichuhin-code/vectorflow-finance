using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class AccountBalanceReaderTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 15, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 16, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private AccountBalanceReader _reader = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;
    private AccountId _cashA;
    private AccountId _revenueA;
    private AccountId _unusedA;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _reader = new AccountBalanceReader(_dbContext);

        _workspaceA = await SeedWorkspaceAsync(
            Guid.Parse("51111111-1111-1111-1111-111111111111"),
            Guid.Parse("52222222-2222-2222-2222-222222222222"),
            "Balance Workspace A");
        _workspaceB = await SeedWorkspaceAsync(
            Guid.Parse("53333333-3333-3333-3333-333333333333"),
            Guid.Parse("54444444-4444-4444-4444-444444444444"),
            "Balance Workspace B");

        _cashA = await SeedAccountAsync(_workspaceA, "1000", "Cash A");
        _revenueA = await SeedAccountAsync(_workspaceA, "4000", "Revenue A", AccountType.Revenue);
        _unusedA = await SeedAccountAsync(_workspaceA, "1500", "Unused A");
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Empty_ledger_returns_zero_balances_for_workspace_accounts()
    {
        var listed = await _reader.ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(3, listed.Count);
        Assert.Equal("1000", listed[0].AccountCode);
        Assert.Equal("1500", listed[1].AccountCode);
        Assert.Equal("4000", listed[2].AccountCode);
        Assert.All(listed, row =>
        {
            Assert.Equal(0m, row.DebitTotal);
            Assert.Equal(0m, row.CreditTotal);
            Assert.Equal(0m, row.Balance);
            Assert.Equal(AccountBalanceCalculator.ZeroSide, row.BalanceSide);
        });

        var cash = await _reader.GetByAccountIdAsync(_workspaceA, _cashA);
        Assert.NotNull(cash);
        Assert.Equal(0m, cash.Balance);
        Assert.Equal(AccountBalanceCalculator.ZeroSide, cash.BalanceSide);
    }

    [Fact]
    public async Task Projects_totals_across_multiple_postings_and_lines()
    {
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 100.25m, T0, T1);
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 50m, T0, T1.AddHours(1));

        await using var readContext = CreateContext();
        var reader = new AccountBalanceReader(readContext);

        var cash = await reader.GetByAccountIdAsync(_workspaceA, _cashA);
        Assert.NotNull(cash);
        Assert.Equal(150.25m, cash.DebitTotal);
        Assert.Equal(0m, cash.CreditTotal);
        Assert.Equal(150.25m, cash.Balance);
        Assert.Equal(AccountBalanceCalculator.DebitSide, cash.BalanceSide);

        var revenue = await reader.GetByAccountIdAsync(_workspaceA, _revenueA);
        Assert.NotNull(revenue);
        Assert.Equal(0m, revenue.DebitTotal);
        Assert.Equal(150.25m, revenue.CreditTotal);
        Assert.Equal(-150.25m, revenue.Balance);
        Assert.Equal(AccountBalanceCalculator.CreditSide, revenue.BalanceSide);

        var unused = await reader.GetByAccountIdAsync(_workspaceA, _unusedA);
        Assert.NotNull(unused);
        Assert.Equal(0m, unused.Balance);
        Assert.Equal(AccountBalanceCalculator.ZeroSide, unused.BalanceSide);

        var listed = await reader.ListByWorkspaceAsync(_workspaceA);
        Assert.Equal(3, listed.Count);
        Assert.Equal(_cashA.Value, listed[0].AccountId);
        Assert.Equal(150.25m, listed[0].DebitTotal);
        Assert.Equal(_unusedA.Value, listed[1].AccountId);
        Assert.Equal(_revenueA.Value, listed[2].AccountId);
        Assert.Equal(150.25m, listed[2].CreditTotal);
    }

    [Fact]
    public async Task Isolates_workspaces_and_missing_account()
    {
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 40m, T0, T1);
        var cashB = await SeedAccountAsync(_workspaceB, "1000", "Cash B");
        var revenueB = await SeedAccountAsync(_workspaceB, "4000", "Revenue B", AccountType.Revenue);
        await SeedPostedLedgerAsync(_workspaceB, cashB, revenueB, 999m, T0, T1);

        await using var readContext = CreateContext();
        var reader = new AccountBalanceReader(readContext);

        var listedA = await reader.ListByWorkspaceAsync(_workspaceA);
        Assert.Equal(3, listedA.Count);
        Assert.DoesNotContain(listedA, row => row.DebitTotal == 999m || row.CreditTotal == 999m);
        Assert.Equal(40m, listedA.Single(row => row.AccountId == _cashA.Value).DebitTotal);

        Assert.Null(await reader.GetByAccountIdAsync(_workspaceB, _cashA));
        Assert.Null(await reader.GetByAccountIdAsync(_workspaceA, AccountId.New()));
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

    private async Task SeedPostedLedgerAsync(
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

        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), entry);
        _dbContext.LedgerPostings.Add(posting);
        await _dbContext.SaveChangesAsync();
    }
}
