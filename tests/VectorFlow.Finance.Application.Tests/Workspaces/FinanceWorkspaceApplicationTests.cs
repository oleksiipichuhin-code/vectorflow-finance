using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Application.Workspaces.Queries;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Application.Tests.Workspaces;

public sealed class FinanceWorkspaceApplicationTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 18, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 18, 11, 0, 0, TimeSpan.Zero);

    private static readonly Guid OrganizationId =
        Guid.Parse("11111111-1111-1111-1111-111111111111");

    private static readonly Guid PlatformWorkspaceId =
        Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static (InMemoryFinanceWorkspaceRepository Repository, FixedClock Clock) CreateHarness()
    {
        var repository = new InMemoryFinanceWorkspaceRepository();
        var clock = new FixedClock(T0);
        return (repository, clock);
    }

    private static async Task<FinanceWorkspaceDto> CreateWorkspaceAsync(
        InMemoryFinanceWorkspaceRepository repository,
        FixedClock clock,
        string name = "Primary Finance",
        string currency = "uah")
    {
        var handler = new CreateFinanceWorkspaceHandler(repository, clock);
        var result = await handler.HandleAsync(
            new CreateFinanceWorkspaceCommand(OrganizationId, PlatformWorkspaceId, name, currency));

        Assert.True(result.IsSuccess);
        return result.Value!;
    }

    private static async Task<ApplicationResult<FinanceWorkspaceDto>> CreateDuplicateAsync(
        InMemoryFinanceWorkspaceRepository repository,
        FixedClock clock) =>
        await new CreateFinanceWorkspaceHandler(repository, clock).HandleAsync(
            new CreateFinanceWorkspaceCommand(
                OrganizationId,
                PlatformWorkspaceId,
                "Another",
                "USD"));

    [Fact]
    public async Task Create_returns_dto_and_persists_via_repository()
    {
        var (repository, clock) = CreateHarness();
        var handler = new CreateFinanceWorkspaceHandler(repository, clock);

        var result = await handler.HandleAsync(
            new CreateFinanceWorkspaceCommand(
                OrganizationId,
                PlatformWorkspaceId,
                "  Operating Finance  ",
                "uah"));

        Assert.True(result.IsSuccess);
        Assert.Equal(ApplicationErrorKind.None, result.ErrorKind);
        Assert.Equal("Operating Finance", result.Value!.Name);
        Assert.Equal("UAH", result.Value.DefaultCurrency);
        Assert.Equal(nameof(FinanceWorkspaceStatus.Active), result.Value.Status);
        Assert.Equal(OrganizationId, result.Value.PlatformOrganizationId);
        Assert.Equal(PlatformWorkspaceId, result.Value.PlatformWorkspaceId);
        Assert.Equal(T0, result.Value.CreatedAt);
        Assert.Equal(T0, result.Value.UpdatedAt);
        Assert.Equal(1, repository.AddCallCount);
        Assert.Equal(1, repository.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_rejects_duplicate_Active_workspace_as_Conflict()
    {
        var (repository, clock) = CreateHarness();
        await CreateWorkspaceAsync(repository, clock);

        clock.UtcNow = T1;
        var conflict = await CreateDuplicateAsync(repository, clock);

        Assert.Equal(ApplicationErrorKind.Conflict, conflict.ErrorKind);
        Assert.Equal(1, repository.AddCallCount);
    }

    [Fact]
    public async Task Create_rejects_duplicate_Suspended_workspace_as_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);

        clock.UtcNow = T1;
        Assert.True((await new SuspendFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new SuspendFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddHours(1);
        var conflict = await CreateDuplicateAsync(repository, clock);

        Assert.Equal(ApplicationErrorKind.Conflict, conflict.ErrorKind);
        Assert.Equal(1, repository.AddCallCount);
    }

    [Fact]
    public async Task Create_rejects_duplicate_Archived_workspace_as_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);

        clock.UtcNow = T1;
        Assert.True((await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddHours(1);
        var conflict = await CreateDuplicateAsync(repository, clock);

        Assert.Equal(ApplicationErrorKind.Conflict, conflict.ErrorKind);
        Assert.Equal(1, repository.AddCallCount);
    }

    [Fact]
    public async Task Create_validation_failed_for_blank_name()
    {
        var (repository, clock) = CreateHarness();
        var handler = new CreateFinanceWorkspaceHandler(repository, clock);

        var result = await handler.HandleAsync(
            new CreateFinanceWorkspaceCommand(OrganizationId, PlatformWorkspaceId, "   ", "UAH"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, repository.AddCallCount);
        Assert.Equal(0, repository.SaveChangesCallCount);
    }

    [Fact]
    public async Task Get_returns_workspace_dto()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        var handler = new GetFinanceWorkspaceHandler(repository);

        var result = await handler.HandleAsync(new GetFinanceWorkspaceQuery(created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(created.Id, result.Value!.Id);
        Assert.Equal("UAH", result.Value.DefaultCurrency);
    }

    [Fact]
    public async Task Get_returns_not_found()
    {
        var (repository, _) = CreateHarness();
        var handler = new GetFinanceWorkspaceHandler(repository);

        var result = await handler.HandleAsync(
            new GetFinanceWorkspaceQuery(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task Rename_updates_name_using_clock()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;

        var handler = new RenameFinanceWorkspaceHandler(repository, clock);
        var result = await handler.HandleAsync(
            new RenameFinanceWorkspaceCommand(created.Id, "Renamed Finance"));

        Assert.True(result.IsSuccess);
        Assert.Equal("Renamed Finance", result.Value!.Name);
        Assert.Equal(T1, result.Value.UpdatedAt);
        Assert.Equal(2, repository.SaveChangesCallCount);
    }

    [Fact]
    public async Task Rename_to_current_normalized_name_is_Success_and_preserves_UpdatedAt()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock, name: "Primary Finance");
        clock.UtcNow = T1;

        var result = await new RenameFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new RenameFinanceWorkspaceCommand(created.Id, "  Primary Finance  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("Primary Finance", result.Value!.Name);
        Assert.Equal(T0, result.Value.UpdatedAt);
        Assert.Equal(2, repository.SaveChangesCallCount);
    }

    [Fact]
    public async Task Rename_Archived_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;
        Assert.True((await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddHours(1);
        var result = await new RenameFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new RenameFinanceWorkspaceCommand(created.Id, "Nope"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Change_currency_normalizes_and_maps_string()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;

        var handler = new ChangeFinanceWorkspaceDefaultCurrencyHandler(repository, clock);
        var result = await handler.HandleAsync(
            new ChangeFinanceWorkspaceDefaultCurrencyCommand(created.Id, "eur"));

        Assert.True(result.IsSuccess);
        Assert.Equal("EUR", result.Value!.DefaultCurrency);
        Assert.IsType<string>(result.Value.DefaultCurrency);
    }

    [Fact]
    public async Task Change_currency_to_current_normalized_value_is_Success_and_preserves_UpdatedAt()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock, currency: "UAH");
        clock.UtcNow = T1;

        var result = await new ChangeFinanceWorkspaceDefaultCurrencyHandler(repository, clock)
            .HandleAsync(new ChangeFinanceWorkspaceDefaultCurrencyCommand(created.Id, "uah"));

        Assert.True(result.IsSuccess);
        Assert.Equal("UAH", result.Value!.DefaultCurrency);
        Assert.Equal(T0, result.Value.UpdatedAt);
        Assert.Equal(2, repository.SaveChangesCallCount);
    }

    [Fact]
    public async Task Change_currency_while_Suspended_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;
        Assert.True((await new SuspendFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new SuspendFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddMinutes(1);
        var result = await new ChangeFinanceWorkspaceDefaultCurrencyHandler(repository, clock)
            .HandleAsync(new ChangeFinanceWorkspaceDefaultCurrencyCommand(created.Id, "USD"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Change_currency_while_Archived_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;
        Assert.True((await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddMinutes(1);
        var result = await new ChangeFinanceWorkspaceDefaultCurrencyHandler(repository, clock)
            .HandleAsync(new ChangeFinanceWorkspaceDefaultCurrencyCommand(created.Id, "USD"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Suspend_reactivate_and_archive_lifecycle()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);

        clock.UtcNow = T1;
        var suspended = await new SuspendFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new SuspendFinanceWorkspaceCommand(created.Id));
        Assert.Equal(nameof(FinanceWorkspaceStatus.Suspended), suspended.Value!.Status);

        clock.UtcNow = T1.AddHours(1);
        var reactivated = await new ReactivateFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ReactivateFinanceWorkspaceCommand(created.Id));
        Assert.Equal(nameof(FinanceWorkspaceStatus.Active), reactivated.Value!.Status);

        clock.UtcNow = T1.AddHours(2);
        var archived = await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id));
        Assert.Equal(nameof(FinanceWorkspaceStatus.Archived), archived.Value!.Status);
    }

    [Fact]
    public async Task Suspend_already_Suspended_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;
        Assert.True((await new SuspendFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new SuspendFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddMinutes(1);
        var result = await new SuspendFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new SuspendFinanceWorkspaceCommand(created.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Reactivate_already_Active_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);

        var result = await new ReactivateFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ReactivateFinanceWorkspaceCommand(created.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Archive_already_Archived_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;
        Assert.True((await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddMinutes(1);
        var result = await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Reactivate_Archived_returns_Conflict()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);
        clock.UtcNow = T1;
        Assert.True((await new ArchiveFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ArchiveFinanceWorkspaceCommand(created.Id))).IsSuccess);

        clock.UtcNow = T1.AddHours(1);
        var result = await new ReactivateFinanceWorkspaceHandler(repository, clock)
            .HandleAsync(new ReactivateFinanceWorkspaceCommand(created.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
    }

    [Fact]
    public async Task Dto_mapping_exposes_currency_as_string_not_domain_type()
    {
        var (repository, clock) = CreateHarness();
        var created = await CreateWorkspaceAsync(repository, clock);

        Assert.IsType<string>(created.DefaultCurrency);
        Assert.IsType<string>(created.Status);
        Assert.IsType<Guid>(created.Id);
        Assert.DoesNotContain("VectorFlow.Finance.Domain", created.GetType().Assembly.GetName().Name!);
    }

    [Fact]
    public async Task Clock_value_is_used_for_create_timestamps()
    {
        var (repository, clock) = CreateHarness();
        clock.UtcNow = T1;

        var created = await CreateWorkspaceAsync(repository, clock);

        Assert.Equal(T1, created.CreatedAt);
        Assert.Equal(T1, created.UpdatedAt);
    }

    [Fact]
    public async Task Mutation_returns_not_found_for_unknown_id()
    {
        var (repository, clock) = CreateHarness();
        var handler = new RenameFinanceWorkspaceHandler(repository, clock);

        var result = await handler.HandleAsync(
            new RenameFinanceWorkspaceCommand(
                Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                "Name"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, repository.SaveChangesCallCount);
    }
}
