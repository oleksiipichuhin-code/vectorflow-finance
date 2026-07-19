using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Application.Accounts.Commands;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Application.JournalEntries.Commands;
using VectorFlow.Finance.Application.JournalEntries.Handlers;
using VectorFlow.Finance.Application.JournalEntries.Queries;
using VectorFlow.Finance.Application.Tests.Workspaces;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Domain.JournalEntries;
using Xunit;
using FixedClock = VectorFlow.Finance.Application.Tests.Accounts.FixedClock;
using InMemoryAccountRepository = VectorFlow.Finance.Application.Tests.Accounts.InMemoryAccountRepository;

namespace VectorFlow.Finance.Application.Tests.JournalEntries;

public sealed class JournalEntryApplicationTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 11, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static readonly Guid OrganizationId =
        Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");

    private static readonly Guid PlatformWorkspaceId =
        Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222");

    private static (
        InMemoryJournalEntryRepository JournalEntries,
        InMemoryAccountRepository Accounts,
        InMemoryFinanceWorkspaceRepository Workspaces,
        FixedClock Clock) CreateHarness()
    {
        var journalEntries = new InMemoryJournalEntryRepository();
        var accounts = new InMemoryAccountRepository();
        var workspaces = new InMemoryFinanceWorkspaceRepository();
        var clock = new FixedClock(T0);
        return (journalEntries, accounts, workspaces, clock);
    }

    private static async Task<Guid> SeedWorkspaceAsync(
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid? organizationId = null,
        Guid? platformWorkspaceId = null,
        string name = "Primary Finance")
    {
        var result = await new CreateFinanceWorkspaceHandler(workspaces, clock).HandleAsync(
            new CreateFinanceWorkspaceCommand(
                organizationId ?? OrganizationId,
                platformWorkspaceId ?? PlatformWorkspaceId,
                name,
                "UAH"));

        Assert.True(result.IsSuccess);
        return result.Value!.Id;
    }

    private static async Task<AccountDto> SeedAccountAsync(
        InMemoryAccountRepository accounts,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId,
        string code = "1000",
        string name = "Cash",
        string type = "Asset")
    {
        var result = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, code, name, type));

        Assert.True(result.IsSuccess);
        return result.Value!;
    }

    private static async Task<JournalEntryDto> CreateEntryAsync(
        InMemoryJournalEntryRepository journalEntries,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId,
        string name = "Opening entry")
    {
        var result = await new CreateJournalEntryHandler(journalEntries, workspaces, clock)
            .HandleAsync(new CreateJournalEntryCommand(workspaceId, name));

        Assert.True(result.IsSuccess);
        return result.Value!;
    }

    [Fact]
    public async Task Create_returns_draft_dto_and_persists()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateJournalEntryHandler(journalEntries, workspaces, clock)
            .HandleAsync(new CreateJournalEntryCommand(workspaceId, "  Month close  "));

        Assert.True(result.IsSuccess);
        Assert.Equal(workspaceId, result.Value!.FinanceWorkspaceId);
        Assert.Equal("Month close", result.Value.Name);
        Assert.Equal(nameof(JournalEntryStatus.Draft), result.Value.Status);
        Assert.Equal(T0, result.Value.CreatedAtUtc);
        Assert.Equal(T0, result.Value.UpdatedAtUtc);
        Assert.Null(result.Value.PostedAtUtc);
        Assert.Empty(result.Value.Lines);
        Assert.Equal(0m, result.Value.TotalDebit);
        Assert.Equal(0m, result.Value.TotalCredit);
        Assert.Equal(1, journalEntries.AddCallCount);
        Assert.Equal(1, journalEntries.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_rejects_missing_workspace()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();

        var result = await new CreateJournalEntryHandler(journalEntries, workspaces, clock)
            .HandleAsync(new CreateJournalEntryCommand(Guid.NewGuid(), "Entry"));

        Assert.False(result.IsSuccess);
        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, journalEntries.AddCallCount);
    }

    [Fact]
    public async Task Get_returns_entry_from_same_workspace()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);

        var result = await new GetJournalEntryHandler(journalEntries).HandleAsync(
            new GetJournalEntryQuery(workspaceId, created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(created.Id, result.Value!.Id);
    }

    [Fact]
    public async Task Get_wrong_workspace_returns_NotFound()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");
        var created = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceA);

        var result = await new GetJournalEntryHandler(journalEntries).HandleAsync(
            new GetJournalEntryQuery(workspaceB, created.Id));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Journal entry was not found.", result.ErrorMessage);
    }

    [Fact]
    public async Task List_returns_only_requested_workspace_newest_first()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        clock.UtcNow = T0;
        var older = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceA, "Older");
        clock.UtcNow = T1;
        var newer = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceA, "Newer");
        clock.UtcNow = T2;
        await CreateEntryAsync(journalEntries, workspaces, clock, workspaceB, "Other workspace");

        var result = await new GetJournalEntriesHandler(journalEntries).HandleAsync(
            new GetJournalEntriesQuery(workspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(newer.Id, result.Value[0].Id);
        Assert.Equal(older.Id, result.Value[1].Id);
    }

    [Fact]
    public async Task Rename_updates_draft()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new RenameJournalEntryHandler(journalEntries, clock).HandleAsync(
            new RenameJournalEntryCommand(workspaceId, created.Id, "Renamed"));

        Assert.True(result.IsSuccess);
        Assert.Equal("Renamed", result.Value!.Name);
        Assert.Equal(T1, result.Value.UpdatedAtUtc);
        Assert.Equal(2, journalEntries.SaveChangesCallCount);
    }

    [Fact]
    public async Task Rename_rejects_posted()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "1000", "Cash");
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateBalancedPostedAsync(journalEntries, accounts, workspaces, clock, workspaceId, cash.Id, revenue.Id);

        var result = await new RenameJournalEntryHandler(journalEntries, clock).HandleAsync(
            new RenameJournalEntryCommand(workspaceId, entry.Id, "Nope"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Rename_rejects_cross_workspace()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");
        var created = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceA);

        var result = await new RenameJournalEntryHandler(journalEntries, clock).HandleAsync(
            new RenameJournalEntryCommand(workspaceB, created.Id, "Nope"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task AddLine_adds_debit_and_credit_lines()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var debit = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cash.Id, 100m, 0m, "Cash"));
        var credit = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, revenue.Id, 0m, 100m, "Revenue"));

        Assert.True(debit.IsSuccess);
        Assert.True(credit.IsSuccess);
        Assert.Equal(2, credit.Value!.Lines.Count);
        Assert.Equal(100m, credit.Value.TotalDebit);
        Assert.Equal(100m, credit.Value.TotalCredit);
        Assert.Equal(1, credit.Value.Lines[0].Sequence);
        Assert.Equal(2, credit.Value.Lines[1].Sequence);
    }

    [Fact]
    public async Task AddLine_rejects_missing_account()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);

        var result = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, Guid.NewGuid(), 10m, 0m, null));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Account was not found.", result.ErrorMessage);
    }

    [Fact]
    public async Task AddLine_rejects_account_from_another_workspace()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");
        var foreignAccount = await SeedAccountAsync(accounts, workspaces, clock, workspaceB, "1000", "Foreign");
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceA);

        var result = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceA, entry.Id, foreignAccount.Id, 10m, 0m, null));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task AddLine_rejects_posted_mutation()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateBalancedPostedAsync(journalEntries, accounts, workspaces, clock, workspaceId, cash.Id, revenue.Id);
        var saveCount = journalEntries.SaveChangesCallCount;

        var result = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cash.Id, 1m, 0m, null));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(saveCount, journalEntries.SaveChangesCallCount);
    }

    [Fact]
    public async Task UpdateLine_updates_valid_line()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var expense = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "5000", "Expense", "Expense");
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var withLine = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cash.Id, 10m, 0m, "Old"));
        var lineId = withLine.Value!.Lines[0].Id;
        clock.UtcNow = T2;

        var result = await new UpdateJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new UpdateJournalEntryLineCommand(workspaceId, entry.Id, lineId, expense.Id, 0m, 25m, "New"));

        Assert.True(result.IsSuccess);
        Assert.Equal(expense.Id, result.Value!.Lines[0].FinancialAccountId);
        Assert.Equal(0m, result.Value.Lines[0].Debit);
        Assert.Equal(25m, result.Value.Lines[0].Credit);
        Assert.Equal("New", result.Value.Lines[0].Description);
    }

    [Fact]
    public async Task UpdateLine_rejects_missing_line()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);

        var result = await new UpdateJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new UpdateJournalEntryLineCommand(workspaceId, entry.Id, Guid.NewGuid(), cash.Id, 5m, 0m, null));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task UpdateLine_rejects_foreign_workspace_account()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");
        var cashA = await SeedAccountAsync(accounts, workspaces, clock, workspaceA);
        var cashB = await SeedAccountAsync(accounts, workspaces, clock, workspaceB, "1000", "Foreign");
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceA);
        clock.UtcNow = T1;
        var withLine = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceA, entry.Id, cashA.Id, 10m, 0m, null));
        var lineId = withLine.Value!.Lines[0].Id;

        var result = await new UpdateJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new UpdateJournalEntryLineCommand(workspaceA, entry.Id, lineId, cashB.Id, 10m, 0m, null));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task UpdateLine_rejects_posted_mutation()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateBalancedPostedAsync(journalEntries, accounts, workspaces, clock, workspaceId, cash.Id, revenue.Id);
        var lineId = entry.Lines[0].Id;

        var result = await new UpdateJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new UpdateJournalEntryLineCommand(workspaceId, entry.Id, lineId, cash.Id, 50m, 0m, null));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task RemoveLine_removes_line()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var withLine = await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cash.Id, 10m, 0m, null));
        var lineId = withLine.Value!.Lines[0].Id;
        clock.UtcNow = T2;

        var result = await new RemoveJournalEntryLineHandler(journalEntries, clock).HandleAsync(
            new RemoveJournalEntryLineCommand(workspaceId, entry.Id, lineId));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Lines);
    }

    [Fact]
    public async Task RemoveLine_rejects_missing_line()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);

        var result = await new RemoveJournalEntryLineHandler(journalEntries, clock).HandleAsync(
            new RemoveJournalEntryLineCommand(workspaceId, entry.Id, Guid.NewGuid()));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task RemoveLine_rejects_posted_mutation()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateBalancedPostedAsync(journalEntries, accounts, workspaces, clock, workspaceId, cash.Id, revenue.Id);

        var result = await new RemoveJournalEntryLineHandler(journalEntries, clock).HandleAsync(
            new RemoveJournalEntryLineCommand(workspaceId, entry.Id, entry.Lines[0].Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(2, entry.Lines.Count);
    }

    [Fact]
    public async Task Post_posts_balanced_entry_and_stores_PostedAtUtc()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cash.Id, 100m, 0m, null));
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, revenue.Id, 0m, 100m, null));
        clock.UtcNow = T2;

        var result = await new PostJournalEntryHandler(journalEntries, clock).HandleAsync(
            new PostJournalEntryCommand(workspaceId, entry.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(JournalEntryStatus.Posted), result.Value!.Status);
        Assert.Equal(T2, result.Value.PostedAtUtc);
    }

    [Fact]
    public async Task Post_rejects_empty_entry_without_save()
    {
        var (journalEntries, _, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        var saveCount = journalEntries.SaveChangesCallCount;

        var result = await new PostJournalEntryHandler(journalEntries, clock).HandleAsync(
            new PostJournalEntryCommand(workspaceId, entry.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(saveCount, journalEntries.SaveChangesCallCount);
    }

    [Fact]
    public async Task Post_rejects_unbalanced_entry_without_save()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cash.Id, 100m, 0m, null));
        var saveCount = journalEntries.SaveChangesCallCount;

        var result = await new PostJournalEntryHandler(journalEntries, clock).HandleAsync(
            new PostJournalEntryCommand(workspaceId, entry.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(saveCount, journalEntries.SaveChangesCallCount);
    }

    [Fact]
    public async Task Post_rejects_repeated_post()
    {
        var (journalEntries, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var cash = await SeedAccountAsync(accounts, workspaces, clock, workspaceId);
        var revenue = await SeedAccountAsync(accounts, workspaces, clock, workspaceId, "4000", "Revenue", "Revenue");
        var entry = await CreateBalancedPostedAsync(journalEntries, accounts, workspaces, clock, workspaceId, cash.Id, revenue.Id);
        var saveCount = journalEntries.SaveChangesCallCount;

        var result = await new PostJournalEntryHandler(journalEntries, clock).HandleAsync(
            new PostJournalEntryCommand(workspaceId, entry.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(saveCount, journalEntries.SaveChangesCallCount);
    }

    private static async Task<JournalEntryDto> CreateBalancedPostedAsync(
        InMemoryJournalEntryRepository journalEntries,
        InMemoryAccountRepository accounts,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId,
        Guid cashAccountId,
        Guid revenueAccountId)
    {
        var entry = await CreateEntryAsync(journalEntries, workspaces, clock, workspaceId, "Balanced");
        clock.UtcNow = T1;
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, cashAccountId, 100m, 0m, null));
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Id, revenueAccountId, 0m, 100m, null));
        clock.UtcNow = T2;
        var posted = await new PostJournalEntryHandler(journalEntries, clock).HandleAsync(
            new PostJournalEntryCommand(workspaceId, entry.Id));
        Assert.True(posted.IsSuccess);
        return posted.Value!;
    }
}
