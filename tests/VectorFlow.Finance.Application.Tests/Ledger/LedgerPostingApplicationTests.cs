using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Application.Accounts.Commands;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Application.JournalEntries.Commands;
using VectorFlow.Finance.Application.JournalEntries.Handlers;
using VectorFlow.Finance.Application.Ledger;
using VectorFlow.Finance.Application.Ledger.Commands;
using VectorFlow.Finance.Application.Ledger.Handlers;
using VectorFlow.Finance.Application.Ledger.Queries;
using VectorFlow.Finance.Application.Tests.JournalEntries;
using VectorFlow.Finance.Application.Tests.Workspaces;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;
using FixedClock = VectorFlow.Finance.Application.Tests.Accounts.FixedClock;
using InMemoryAccountRepository = VectorFlow.Finance.Application.Tests.Accounts.InMemoryAccountRepository;

namespace VectorFlow.Finance.Application.Tests.Ledger;

public sealed class LedgerPostingApplicationTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 11, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static (
        InMemoryLedgerPostingRepository LedgerPostings,
        InMemoryJournalEntryRepository JournalEntries,
        InMemoryAccountRepository Accounts,
        InMemoryFinanceWorkspaceRepository Workspaces,
        FixedClock Clock) CreateHarness()
    {
        return (
            new InMemoryLedgerPostingRepository(),
            new InMemoryJournalEntryRepository(),
            new InMemoryAccountRepository(),
            new InMemoryFinanceWorkspaceRepository(),
            new FixedClock(T0));
    }

    private static async Task<Guid> SeedWorkspaceAsync(
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid organizationId,
        Guid platformWorkspaceId,
        string name = "Ledger WS")
    {
        var result = await new CreateFinanceWorkspaceHandler(workspaces, clock).HandleAsync(
            new CreateFinanceWorkspaceCommand(organizationId, platformWorkspaceId, name, "UAH"));
        Assert.True(result.IsSuccess);
        return result.Value!.Id;
    }

    private static async Task<(Guid Cash, Guid Revenue, Guid EntryId)> SeedPostedEntryAsync(
        InMemoryJournalEntryRepository journalEntries,
        InMemoryAccountRepository accounts,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId,
        decimal amount = 100.25m,
        string cashCode = "1000",
        string revenueCode = "4000",
        DateTimeOffset? createAt = null,
        DateTimeOffset? mutateAt = null,
        DateTimeOffset? postAt = null)
    {
        var createdAt = createAt ?? T0;
        var mutatedAt = mutateAt ?? T1;
        var postedAt = postAt ?? T2;

        clock.UtcNow = createdAt;
        var cash = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, cashCode, "Cash", "Asset"));
        var revenue = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, revenueCode, "Revenue", "Revenue"));
        Assert.True(cash.IsSuccess);
        Assert.True(revenue.IsSuccess);

        var entry = await new CreateJournalEntryHandler(journalEntries, workspaces, clock)
            .HandleAsync(new CreateJournalEntryCommand(workspaceId, "Sale"));
        Assert.True(entry.IsSuccess);

        clock.UtcNow = mutatedAt;
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Value!.Id, cash.Value!.Id, amount, 0m, "Cash"));
        await new AddJournalEntryLineHandler(journalEntries, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Value.Id, revenue.Value!.Id, 0m, amount, "Revenue"));

        clock.UtcNow = postedAt;
        var posted = await new PostJournalEntryHandler(journalEntries, clock).HandleAsync(
            new PostJournalEntryCommand(workspaceId, entry.Value.Id));
        Assert.True(posted.IsSuccess);
        Assert.Equal(nameof(JournalEntryStatus.Posted), posted.Value!.Status);

        return (cash.Value.Id, revenue.Value.Id, entry.Value.Id);
    }

    [Fact]
    public async Task PostToLedger_creates_posting_dto_from_posted_entry()
    {
        var (ledger, journals, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000001"),
            Guid.Parse("a2000000-0000-0000-0000-000000000001"));
        var (_, _, entryId) = await SeedPostedEntryAsync(journals, accounts, workspaces, clock, workspaceId);

        var result = await new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
            new PostJournalEntryToLedgerCommand(workspaceId, entryId));

        Assert.True(result.IsSuccess);
        Assert.Equal(workspaceId, result.Value!.FinanceWorkspaceId);
        Assert.Equal(entryId, result.Value.JournalEntryId);
        Assert.Equal(T2, result.Value.PostedAtUtc);
        Assert.Equal(2, result.Value.Lines.Count);
        Assert.Equal(100.25m, result.Value.TotalDebit);
        Assert.Equal(100.25m, result.Value.TotalCredit);
        Assert.Equal(1, ledger.AddCallCount);
        Assert.Equal(1, ledger.SaveChangesCallCount);

        var journal = await journals.GetByIdAsync(
            new FinanceWorkspaceId(workspaceId),
            new JournalEntryId(entryId));
        Assert.Equal(nameof(JournalEntryStatus.Posted), journal!.Status.ToString());
        Assert.Equal(2, journal.Lines.Count);
    }

    [Fact]
    public async Task PostToLedger_missing_journal_entry_returns_NotFound()
    {
        var (ledger, journals, _, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000002"),
            Guid.Parse("a2000000-0000-0000-0000-000000000002"));

        var result = await new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
            new PostJournalEntryToLedgerCommand(workspaceId, Guid.NewGuid()));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, ledger.AddCallCount);
    }

    [Fact]
    public async Task PostToLedger_wrong_workspace_returns_NotFound()
    {
        var (ledger, journals, accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000003"),
            Guid.Parse("a2000000-0000-0000-0000-000000000003"));
        var workspaceB = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("b1000000-0000-0000-0000-000000000003"),
            Guid.Parse("b2000000-0000-0000-0000-000000000003"),
            "Other");
        var (_, _, entryId) = await SeedPostedEntryAsync(journals, accounts, workspaces, clock, workspaceA);

        var result = await new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
            new PostJournalEntryToLedgerCommand(workspaceB, entryId));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task PostToLedger_draft_returns_Conflict()
    {
        var (ledger, journals, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000004"),
            Guid.Parse("a2000000-0000-0000-0000-000000000004"));
        var cash = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, "1000", "Cash", "Asset"));
        var entry = await new CreateJournalEntryHandler(journals, workspaces, clock)
            .HandleAsync(new CreateJournalEntryCommand(workspaceId, "Draft"));
        await new AddJournalEntryLineHandler(journals, accounts, clock).HandleAsync(
            new AddJournalEntryLineCommand(workspaceId, entry.Value!.Id, cash.Value!.Id, 10m, 0m, null));

        var result = await new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
            new PostJournalEntryToLedgerCommand(workspaceId, entry.Value.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(0, ledger.AddCallCount);
        Assert.Equal(0, ledger.SaveChangesCallCount);
    }

    [Fact]
    public async Task PostToLedger_repeated_command_is_idempotent()
    {
        var (ledger, journals, accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000005"),
            Guid.Parse("a2000000-0000-0000-0000-000000000005"));
        var (_, _, entryId) = await SeedPostedEntryAsync(journals, accounts, workspaces, clock, workspaceId);
        var handler = new PostJournalEntryToLedgerHandler(journals, ledger);

        var first = await handler.HandleAsync(new PostJournalEntryToLedgerCommand(workspaceId, entryId));
        var second = await handler.HandleAsync(new PostJournalEntryToLedgerCommand(workspaceId, entryId));

        Assert.True(first.IsSuccess);
        Assert.True(second.IsSuccess);
        Assert.Equal(first.Value!.Id, second.Value!.Id);
        Assert.Equal(1, ledger.AddCallCount);
        Assert.Equal(1, ledger.SaveChangesCallCount);
        Assert.Equal(2, second.Value.Lines.Count);
    }

    [Fact]
    public async Task PostToLedger_repository_failure_does_not_return_success()
    {
        var (ledger, journals, accounts, workspaces, clock) = CreateHarness();
        ledger.ThrowOnSaveChanges = true;
        var workspaceId = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000006"),
            Guid.Parse("a2000000-0000-0000-0000-000000000006"));
        var (_, _, entryId) = await SeedPostedEntryAsync(journals, accounts, workspaces, clock, workspaceId);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
                new PostJournalEntryToLedgerCommand(workspaceId, entryId)));
    }

    [Fact]
    public async Task Get_by_id_and_by_journal_entry_and_list()
    {
        var (ledger, journals, accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("a1000000-0000-0000-0000-000000000007"),
            Guid.Parse("a2000000-0000-0000-0000-000000000007"));
        var workspaceB = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("b1000000-0000-0000-0000-000000000007"),
            Guid.Parse("b2000000-0000-0000-0000-000000000007"),
            "Other");
        var (_, _, entryA) = await SeedPostedEntryAsync(
            journals, accounts, workspaces, clock, workspaceA, 50m,
            postAt: T1);
        var (_, _, entryB) = await SeedPostedEntryAsync(
            journals, accounts, workspaces, clock, workspaceA, 75m, "1100", "4100",
            createAt: T0.AddHours(2),
            mutateAt: T0.AddHours(3),
            postAt: T0.AddHours(4));
        await SeedPostedEntryAsync(journals, accounts, workspaces, clock, workspaceB, 10m);

        var createdA = await new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
            new PostJournalEntryToLedgerCommand(workspaceA, entryA));
        var createdB = await new PostJournalEntryToLedgerHandler(journals, ledger).HandleAsync(
            new PostJournalEntryToLedgerCommand(workspaceA, entryB));
        Assert.True(createdA.IsSuccess);
        Assert.True(createdB.IsSuccess);

        var byId = await new GetLedgerPostingHandler(ledger).HandleAsync(
            new GetLedgerPostingQuery(workspaceA, createdA.Value!.Id));
        Assert.True(byId.IsSuccess);
        Assert.Equal(createdA.Value.Id, byId.Value!.Id);

        var wrongWorkspace = await new GetLedgerPostingHandler(ledger).HandleAsync(
            new GetLedgerPostingQuery(workspaceB, createdA.Value.Id));
        Assert.Equal(ApplicationErrorKind.NotFound, wrongWorkspace.ErrorKind);

        var missing = await new GetLedgerPostingHandler(ledger).HandleAsync(
            new GetLedgerPostingQuery(workspaceA, Guid.NewGuid()));
        Assert.Equal(ApplicationErrorKind.NotFound, missing.ErrorKind);

        var byJournal = await new GetLedgerPostingByJournalEntryHandler(ledger).HandleAsync(
            new GetLedgerPostingByJournalEntryQuery(workspaceA, entryA));
        Assert.True(byJournal.IsSuccess);
        Assert.Equal(createdA.Value.Id, byJournal.Value!.Id);

        var byJournalMissing = await new GetLedgerPostingByJournalEntryHandler(ledger).HandleAsync(
            new GetLedgerPostingByJournalEntryQuery(workspaceA, Guid.NewGuid()));
        Assert.Equal(ApplicationErrorKind.NotFound, byJournalMissing.ErrorKind);

        var list = await new GetLedgerPostingsHandler(ledger).HandleAsync(
            new GetLedgerPostingsQuery(workspaceA));
        Assert.True(list.IsSuccess);
        Assert.Equal(2, list.Value!.Count);
        Assert.Equal(createdB.Value!.Id, list.Value[0].Id);
        Assert.Equal(createdA.Value.Id, list.Value[1].Id);

        var emptyWs = await SeedWorkspaceAsync(
            workspaces, clock,
            Guid.Parse("c1000000-0000-0000-0000-000000000007"),
            Guid.Parse("c2000000-0000-0000-0000-000000000007"),
            "Empty");
        var emptyList = await new GetLedgerPostingsHandler(ledger).HandleAsync(
            new GetLedgerPostingsQuery(emptyWs));
        Assert.True(emptyList.IsSuccess);
        Assert.Empty(emptyList.Value!);
    }
}
