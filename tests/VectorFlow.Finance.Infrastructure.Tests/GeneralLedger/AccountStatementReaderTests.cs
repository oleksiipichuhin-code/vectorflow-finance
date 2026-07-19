using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.GeneralLedger;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.GeneralLedger;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.GeneralLedger;

public sealed class AccountStatementReaderTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 = new(2026, 7, 10, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T1 = new(2026, 7, 15, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T2 = new(2026, 7, 20, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset T3 = new(2026, 7, 25, 10, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private AccountStatementReader _reader = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;
    private AccountId _cashA;
    private AccountId _revenueA;
    private AccountId _expenseA;
    private AccountId _cashB;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _reader = new AccountStatementReader(_dbContext);

        _workspaceA = await SeedWorkspaceAsync(
            Guid.Parse("61111111-1111-1111-1111-111111111111"),
            Guid.Parse("62222222-2222-2222-2222-222222222222"),
            "Statement Workspace A");
        _workspaceB = await SeedWorkspaceAsync(
            Guid.Parse("63333333-3333-3333-3333-333333333333"),
            Guid.Parse("64444444-4444-4444-4444-444444444444"),
            "Statement Workspace B");

        _cashA = await SeedAccountAsync(_workspaceA, "1000", "Cash A");
        _revenueA = await SeedAccountAsync(_workspaceA, "4000", "Revenue A", AccountType.Revenue);
        _expenseA = await SeedAccountAsync(_workspaceA, "5000", "Expense A", AccountType.Expense);
        _cashB = await SeedAccountAsync(_workspaceB, "1000", "Cash B");
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task One_debit_and_credit_movement_with_running_balances()
    {
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 100.25m, T0, T1, "Cash in", "Sale");

        var statement = await _reader.GetAsync(_workspaceA, _cashA, null, null);
        Assert.NotNull(statement);
        Assert.Equal("1000", statement.AccountCode);
        Assert.Equal(100.25m, statement.PeriodDebit);
        Assert.Equal(0m, statement.PeriodCredit);
        Assert.Equal(100.25m, statement.ClosingDebit);
        Assert.Equal(0m, statement.ClosingCredit);
        Assert.Single(statement.Lines);
        Assert.Equal(100.25m, statement.Lines[0].Debit);
        Assert.Equal("Cash in", statement.Lines[0].Description);
        Assert.Equal(100.25m, statement.Lines[0].RunningDebit);
        Assert.Equal(0m, statement.Lines[0].RunningCredit);

        var revenue = await _reader.GetAsync(_workspaceA, _revenueA, null, null);
        Assert.NotNull(revenue);
        Assert.Equal(0m, revenue.PeriodDebit);
        Assert.Equal(100.25m, revenue.PeriodCredit);
        Assert.Equal(0m, revenue.ClosingDebit);
        Assert.Equal(100.25m, revenue.ClosingCredit);
        Assert.Equal(0m, revenue.Lines[0].RunningDebit);
        Assert.Equal(100.25m, revenue.Lines[0].RunningCredit);
    }

    [Fact]
    public async Task Opening_period_closing_and_inclusive_boundaries()
    {
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 40m, T0, T1);
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 10m, T0, T2);
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 5m, T0, T3);

        var statement = await _reader.GetAsync(_workspaceA, _cashA, T2, T2);
        Assert.NotNull(statement);
        Assert.Equal(T2, statement.PeriodFromUtc);
        Assert.Equal(T2, statement.PeriodToUtc);
        Assert.Equal(40m, statement.OpeningDebit);
        Assert.Equal(0m, statement.OpeningCredit);
        Assert.Equal(10m, statement.PeriodDebit);
        Assert.Equal(0m, statement.PeriodCredit);
        Assert.Equal(50m, statement.ClosingDebit);
        Assert.Single(statement.Lines);
        Assert.Equal(T2, statement.Lines[0].PostedAtUtc);
        Assert.Equal(50m, statement.Lines[0].RunningDebit);
    }

    [Fact]
    public async Task Closing_credit_and_zero_closing_balances()
    {
        await SeedPostedLedgerAsync(_workspaceA, _expenseA, _cashA, 30m, T0, T1);
        var creditClose = await _reader.GetAsync(_workspaceA, _cashA, null, null);
        Assert.NotNull(creditClose);
        Assert.Equal(0m, creditClose.ClosingDebit);
        Assert.Equal(30m, creditClose.ClosingCredit);

        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 30m, T0, T2);
        var zeroClose = await _reader.GetAsync(_workspaceA, _cashA, null, null);
        Assert.NotNull(zeroClose);
        Assert.Equal(0m, zeroClose.ClosingDebit);
        Assert.Equal(0m, zeroClose.ClosingCredit);
        Assert.Equal(2, zeroClose.Lines.Count);
        Assert.Equal(0m, zeroClose.Lines[0].RunningDebit);
        Assert.Equal(30m, zeroClose.Lines[0].RunningCredit);
        Assert.Equal(0m, zeroClose.Lines[1].RunningDebit);
        Assert.Equal(0m, zeroClose.Lines[1].RunningCredit);
    }

    [Fact]
    public async Task Multiple_postings_are_ordered_deterministically()
    {
        var laterFirst = await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 1m, T0, T2);
        var earlier = await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 2m, T0, T1);
        var laterSecond = await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 3m, T0, T2);

        var statement = await _reader.GetAsync(_workspaceA, _cashA, null, null);
        Assert.NotNull(statement);
        Assert.Equal(3, statement.Lines.Count);
        Assert.Equal(earlier.Id.Value, statement.Lines[0].LedgerPostingId);
        Assert.Equal(T1, statement.Lines[0].PostedAtUtc);

        var sameDayOrdered = new[] { laterFirst.Id.Value, laterSecond.Id.Value }
            .OrderBy(id => id)
            .ToArray();
        Assert.Equal(sameDayOrdered[0], statement.Lines[1].LedgerPostingId);
        Assert.Equal(sameDayOrdered[1], statement.Lines[2].LedgerPostingId);
        Assert.Equal(T2, statement.Lines[1].PostedAtUtc);
        Assert.Equal(T2, statement.Lines[2].PostedAtUtc);
    }

    [Fact]
    public async Task Existing_account_with_no_movements_or_outside_period()
    {
        var empty = await _reader.GetAsync(_workspaceA, _cashA, null, null);
        Assert.NotNull(empty);
        Assert.Empty(empty.Lines);
        Assert.Equal(0m, empty.OpeningDebit);
        Assert.Equal(0m, empty.ClosingDebit);

        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 25m, T0, T1);
        var outside = await _reader.GetAsync(_workspaceA, _cashA, T2, T3);
        Assert.NotNull(outside);
        Assert.Empty(outside.Lines);
        Assert.Equal(25m, outside.OpeningDebit);
        Assert.Equal(25m, outside.ClosingDebit);
        Assert.Equal(0m, outside.PeriodDebit);
    }

    [Fact]
    public async Task Unknown_and_cross_workspace_accounts_return_null_and_isolation()
    {
        await SeedPostedLedgerAsync(_workspaceA, _cashA, _revenueA, 40m, T0, T1);
        var revenueB = await SeedAccountAsync(_workspaceB, "4000", "Revenue B", AccountType.Revenue);
        await SeedPostedLedgerAsync(_workspaceB, _cashB, revenueB, 999m, T0, T1);

        Assert.Null(await _reader.GetAsync(_workspaceA, AccountId.New(), null, null));
        Assert.Null(await _reader.GetAsync(_workspaceB, _cashA, null, null));

        var statementA = await _reader.GetAsync(_workspaceA, _cashA, null, null);
        Assert.NotNull(statementA);
        Assert.Equal(40m, statementA.PeriodDebit);
        Assert.DoesNotContain(statementA.Lines, line => line.Debit == 999m || line.Credit == 999m);

        var expenseStatement = await _reader.GetAsync(_workspaceA, _expenseA, null, null);
        Assert.NotNull(expenseStatement);
        Assert.Empty(expenseStatement.Lines);
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

    private async Task<LedgerPosting> SeedPostedLedgerAsync(
        FinanceWorkspaceId workspaceId,
        AccountId debitAccount,
        AccountId creditAccount,
        decimal amount,
        DateTimeOffset createdAt,
        DateTimeOffset postedAt,
        string? debitDescription = "Debit",
        string? creditDescription = "Credit")
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), workspaceId, "Entry", createdAt);
        entry.AddLine(debitAccount, amount, 0m, debitDescription, createdAt);
        entry.AddLine(creditAccount, 0m, amount, creditDescription, createdAt);
        entry.Post(postedAt);
        _dbContext.JournalEntries.Add(entry);
        await _dbContext.SaveChangesAsync();

        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), entry);
        _dbContext.LedgerPostings.Add(posting);
        await _dbContext.SaveChangesAsync();
        return posting;
    }
}
