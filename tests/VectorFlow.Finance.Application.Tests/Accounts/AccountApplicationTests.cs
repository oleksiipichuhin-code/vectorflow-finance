using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Application.Accounts.Commands;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.Accounts.Queries;
using VectorFlow.Finance.Application.Tests.Workspaces;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Domain.Accounts;
using Xunit;
using FixedClock = VectorFlow.Finance.Application.Tests.Accounts.FixedClock;

namespace VectorFlow.Finance.Application.Tests.Accounts;

public sealed class AccountApplicationTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 11, 0, 0, TimeSpan.Zero);

    private static readonly Guid OrganizationId =
        Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static readonly Guid PlatformWorkspaceId =
        Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static (
        InMemoryAccountRepository Accounts,
        InMemoryFinanceWorkspaceRepository Workspaces,
        FixedClock Clock) CreateHarness()
    {
        var accounts = new InMemoryAccountRepository();
        var workspaces = new InMemoryFinanceWorkspaceRepository();
        var clock = new FixedClock(T0);
        return (accounts, workspaces, clock);
    }

    private static async Task<Guid> SeedWorkspaceAsync(
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid? organizationId = null,
        Guid? platformWorkspaceId = null,
        string name = "Primary Finance",
        string currency = "UAH")
    {
        var result = await new CreateFinanceWorkspaceHandler(workspaces, clock).HandleAsync(
            new CreateFinanceWorkspaceCommand(
                organizationId ?? OrganizationId,
                platformWorkspaceId ?? PlatformWorkspaceId,
                name,
                currency));

        Assert.True(result.IsSuccess);
        return result.Value!.Id;
    }

    private static async Task<AccountDto> CreateAccountAsync(
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

    [Fact]
    public async Task Create_returns_dto_and_persists_via_repository()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var handler = new CreateAccountHandler(accounts, workspaces, clock);

        var result = await handler.HandleAsync(
            new CreateAccountCommand(workspaceId, " 1000 ", "  Operating Cash  ", "asset"));

        Assert.True(result.IsSuccess);
        Assert.Equal(ApplicationErrorKind.None, result.ErrorKind);
        Assert.Equal(workspaceId, result.Value!.FinanceWorkspaceId);
        Assert.Equal("1000", result.Value.Code);
        Assert.Equal("Operating Cash", result.Value.Name);
        Assert.Equal(nameof(AccountType.Asset), result.Value.Type);
        Assert.Equal(nameof(AccountStatus.Active), result.Value.Status);
        Assert.Equal(T0, result.Value.CreatedAt);
        Assert.Equal(T0, result.Value.UpdatedAt);
        Assert.Null(result.Value.ArchivedAt);
        Assert.Equal(1, accounts.AddCallCount);
        Assert.Equal(1, accounts.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_rejects_duplicate_code_as_Conflict()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "1000");

        clock.UtcNow = T1;
        var conflict = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, "1000", "Another Cash", "Asset"));

        Assert.Equal(ApplicationErrorKind.Conflict, conflict.ErrorKind);
        Assert.Equal(1, accounts.AddCallCount);
    }

    [Fact]
    public async Task Create_rejects_case_equivalent_duplicate_code_as_Conflict()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "Cash");

        clock.UtcNow = T1;
        var conflict = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, "cash", "Petty", "Asset"));

        Assert.Equal(ApplicationErrorKind.Conflict, conflict.ErrorKind);
        Assert.Equal(1, accounts.AddCallCount);
    }

    [Fact]
    public async Task Create_rejects_duplicate_code_on_archived_account_as_Conflict()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "1000");

        clock.UtcNow = T1;
        Assert.True((await new ArchiveAccountHandler(accounts, clock)
            .HandleAsync(new ArchiveAccountCommand(workspaceId, created.Id))).IsSuccess);

        clock.UtcNow = T1.AddHours(1);
        var conflict = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, "1000", "Replacement", "Asset"));

        Assert.Equal(ApplicationErrorKind.Conflict, conflict.ErrorKind);
        Assert.Equal(1, accounts.AddCallCount);
    }

    [Fact]
    public async Task Create_allows_same_code_in_different_workspaces()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            organizationId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
            platformWorkspaceId: Guid.Parse("44444444-4444-4444-4444-444444444444"),
            name: "Secondary Finance",
            currency: "USD");

        await CreateAccountAsync(accounts, workspaces, clock, workspaceA, code: "1000");
        clock.UtcNow = T1;

        var second = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceB, "1000", "Cash B", "Asset"));

        Assert.True(second.IsSuccess);
        Assert.Equal(2, accounts.AddCallCount);
    }

    [Fact]
    public async Task Create_returns_NotFound_when_workspace_missing()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var handler = new CreateAccountHandler(accounts, workspaces, clock);

        var result = await handler.HandleAsync(
            new CreateAccountCommand(
                Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                "1000",
                "Cash",
                "Asset"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, accounts.AddCallCount);
    }

    [Fact]
    public async Task Create_validation_failed_for_blank_name()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, "1000", "   ", "Asset"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accounts.AddCallCount);
        Assert.Equal(0, accounts.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_validation_failed_for_undefined_type()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateAccountHandler(accounts, workspaces, clock).HandleAsync(
            new CreateAccountCommand(workspaceId, "1000", "Cash", "NotAType"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accounts.AddCallCount);
    }

    [Fact]
    public async Task Get_returns_account_dto()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);

        var result = await new GetAccountHandler(accounts).HandleAsync(
            new GetAccountQuery(workspaceId, created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(created.Id, result.Value!.Id);
        Assert.Equal("1000", result.Value.Code);
    }

    [Fact]
    public async Task Get_returns_not_found()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccountHandler(accounts).HandleAsync(
            new GetAccountQuery(workspaceId, Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task Get_wrong_workspace_returns_NotFound_without_revealing_account()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            organizationId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
            platformWorkspaceId: Guid.Parse("44444444-4444-4444-4444-444444444444"),
            name: "Secondary Finance",
            currency: "USD");
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceA);

        var result = await new GetAccountHandler(accounts).HandleAsync(
            new GetAccountQuery(workspaceB, created.Id));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Account was not found.", result.ErrorMessage);
    }

    [Fact]
    public async Task GetByCode_returns_account_dto()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "1000", name: "Cash");

        var result = await new GetAccountByCodeHandler(accounts).HandleAsync(
            new GetAccountByCodeQuery(workspaceId, "1000"));

        Assert.True(result.IsSuccess);
        Assert.Equal("Cash", result.Value!.Name);
    }

    [Fact]
    public async Task GetByCode_is_case_insensitive()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "Cash");

        var result = await new GetAccountByCodeHandler(accounts).HandleAsync(
            new GetAccountByCodeQuery(workspaceId, "cash"));

        Assert.True(result.IsSuccess);
        Assert.Equal("Cash", result.Value!.Code);
    }

    [Fact]
    public async Task GetByCode_returns_not_found()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccountByCodeHandler(accounts).HandleAsync(
            new GetAccountByCodeQuery(workspaceId, "9999"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task GetByCode_does_not_leak_account_from_other_workspace()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            organizationId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
            platformWorkspaceId: Guid.Parse("44444444-4444-4444-4444-444444444444"),
            name: "Secondary Finance",
            currency: "USD");
        await CreateAccountAsync(accounts, workspaces, clock, workspaceA, code: "1000");

        var result = await new GetAccountByCodeHandler(accounts).HandleAsync(
            new GetAccountByCodeQuery(workspaceB, "1000"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task Rename_updates_name_using_clock()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new RenameAccountHandler(accounts, clock).HandleAsync(
            new RenameAccountCommand(workspaceId, created.Id, "Petty Cash"));

        Assert.True(result.IsSuccess);
        Assert.Equal("Petty Cash", result.Value!.Name);
        Assert.Equal(T1, result.Value.UpdatedAt);
        Assert.Equal(2, accounts.SaveChangesCallCount);
    }

    [Fact]
    public async Task Rename_noop_preserves_UpdatedAt()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, name: "Cash");
        clock.UtcNow = T1;

        var result = await new RenameAccountHandler(accounts, clock).HandleAsync(
            new RenameAccountCommand(workspaceId, created.Id, "  Cash  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("Cash", result.Value!.Name);
        Assert.Equal(T0, result.Value.UpdatedAt);
        Assert.Equal(2, accounts.SaveChangesCallCount);
    }

    [Fact]
    public async Task Rename_Archived_returns_Conflict()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        Assert.True((await new ArchiveAccountHandler(accounts, clock)
            .HandleAsync(new ArchiveAccountCommand(workspaceId, created.Id))).IsSuccess);

        clock.UtcNow = T1.AddHours(1);
        var result = await new RenameAccountHandler(accounts, clock).HandleAsync(
            new RenameAccountCommand(workspaceId, created.Id, "Nope"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Rename_wrong_workspace_returns_NotFound()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            organizationId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
            platformWorkspaceId: Guid.Parse("44444444-4444-4444-4444-444444444444"),
            name: "Secondary Finance",
            currency: "USD");
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceA);
        clock.UtcNow = T1;

        var result = await new RenameAccountHandler(accounts, clock).HandleAsync(
            new RenameAccountCommand(workspaceB, created.Id, "Leaked"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Account was not found.", result.ErrorMessage);
        Assert.Equal(1, accounts.SaveChangesCallCount);
    }

    [Fact]
    public async Task ChangeCode_updates_code_using_clock()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "1000");
        clock.UtcNow = T1;

        var result = await new ChangeAccountCodeHandler(accounts, clock).HandleAsync(
            new ChangeAccountCodeCommand(workspaceId, created.Id, "1100"));

        Assert.True(result.IsSuccess);
        Assert.Equal("1100", result.Value!.Code);
        Assert.Equal(T1, result.Value.UpdatedAt);
    }

    [Fact]
    public async Task ChangeCode_case_equivalent_noop_preserves_casing_and_UpdatedAt()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "Cash");
        clock.UtcNow = T1;

        var result = await new ChangeAccountCodeHandler(accounts, clock).HandleAsync(
            new ChangeAccountCodeCommand(workspaceId, created.Id, "cash"));

        Assert.True(result.IsSuccess);
        Assert.Equal("Cash", result.Value!.Code);
        Assert.Equal(T0, result.Value.UpdatedAt);
    }

    [Fact]
    public async Task ChangeCode_rejects_duplicate_as_Conflict()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var first = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "1000");
        await CreateAccountAsync(accounts, workspaces, clock, workspaceId, code: "1100", name: "Bank");
        clock.UtcNow = T1;

        var result = await new ChangeAccountCodeHandler(accounts, clock).HandleAsync(
            new ChangeAccountCodeCommand(workspaceId, first.Id, "1100"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal("1000", (await new GetAccountHandler(accounts)
            .HandleAsync(new GetAccountQuery(workspaceId, first.Id))).Value!.Code);
    }

    [Fact]
    public async Task ChangeType_updates_type_using_clock()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, type: "Asset");
        clock.UtcNow = T1;

        var result = await new ChangeAccountTypeHandler(accounts, clock).HandleAsync(
            new ChangeAccountTypeCommand(workspaceId, created.Id, "expense"));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(AccountType.Expense), result.Value!.Type);
        Assert.Equal(T1, result.Value.UpdatedAt);
    }

    [Fact]
    public async Task ChangeType_same_type_noop_preserves_UpdatedAt()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId, type: "Asset");
        clock.UtcNow = T1;

        var result = await new ChangeAccountTypeHandler(accounts, clock).HandleAsync(
            new ChangeAccountTypeCommand(workspaceId, created.Id, "Asset"));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(AccountType.Asset), result.Value!.Type);
        Assert.Equal(T0, result.Value.UpdatedAt);
    }

    [Fact]
    public async Task Archive_transitions_to_archived()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ArchiveAccountHandler(accounts, clock).HandleAsync(
            new ArchiveAccountCommand(workspaceId, created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(AccountStatus.Archived), result.Value!.Status);
        Assert.Equal(T1, result.Value.ArchivedAt);
        Assert.Equal(T1, result.Value.UpdatedAt);
    }

    [Fact]
    public async Task Archive_already_Archived_returns_Conflict()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        Assert.True((await new ArchiveAccountHandler(accounts, clock)
            .HandleAsync(new ArchiveAccountCommand(workspaceId, created.Id))).IsSuccess);

        clock.UtcNow = T1.AddMinutes(1);
        var result = await new ArchiveAccountHandler(accounts, clock).HandleAsync(
            new ArchiveAccountCommand(workspaceId, created.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Mutation_returns_not_found_for_unknown_id()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new RenameAccountHandler(accounts, clock).HandleAsync(
            new RenameAccountCommand(
                workspaceId,
                Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
                "Name"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, accounts.SaveChangesCallCount);
    }

    [Fact]
    public async Task Dto_mapping_exposes_primitives_not_domain_types()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);

        Assert.IsType<string>(created.Code);
        Assert.IsType<string>(created.Type);
        Assert.IsType<string>(created.Status);
        Assert.IsType<Guid>(created.Id);
        Assert.DoesNotContain("VectorFlow.Finance.Domain", created.GetType().Assembly.GetName().Name!);
    }

    [Fact]
    public async Task Clock_value_is_used_for_create_timestamps()
    {
        var (accounts, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        clock.UtcNow = T1;

        var created = await CreateAccountAsync(accounts, workspaces, clock, workspaceId);

        Assert.Equal(T1, created.CreatedAt);
        Assert.Equal(T1, created.UpdatedAt);
    }
}
