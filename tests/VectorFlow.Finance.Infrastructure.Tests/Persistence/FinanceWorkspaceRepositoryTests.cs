using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class FinanceWorkspaceRepositoryTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 18, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 18, 13, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private FinanceWorkspaceRepository _repository = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _repository = new FinanceWorkspaceRepository(_dbContext);
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Add_and_GetById_persists_workspace_state()
    {
        var organizationId = new PlatformOrganizationId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var platformWorkspaceId = new PlatformWorkspaceId(Guid.Parse("22222222-2222-2222-2222-222222222222"));
        var workspace = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            organizationId,
            platformWorkspaceId,
            "  Primary Finance  ",
            "uah",
            T0);

        await _repository.AddAsync(workspace);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new FinanceWorkspaceRepository(readContext).GetByIdAsync(workspace.Id);

        Assert.NotNull(loaded);
        Assert.Equal(workspace.Id, loaded.Id);
        Assert.Equal(organizationId, loaded.PlatformOrganizationId);
        Assert.Equal(platformWorkspaceId, loaded.PlatformWorkspaceId);
        Assert.Equal("Primary Finance", loaded.Name);
        Assert.Equal(new Currency("UAH"), loaded.DefaultCurrency);
        Assert.Equal(FinanceWorkspaceStatus.Active, loaded.Status);
        Assert.Equal(T0, loaded.CreatedAt);
        Assert.Equal(T0, loaded.UpdatedAt);
    }

    [Fact]
    public async Task GetByPlatformScope_returns_matching_workspace()
    {
        var organizationId = new PlatformOrganizationId(Guid.Parse("33333333-3333-3333-3333-333333333333"));
        var platformWorkspaceId = new PlatformWorkspaceId(Guid.Parse("44444444-4444-4444-4444-444444444444"));
        var workspace = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            organizationId,
            platformWorkspaceId,
            "Scoped Finance",
            "EUR",
            T0);

        await _repository.AddAsync(workspace);
        await _repository.SaveChangesAsync();

        var loaded = await _repository.GetByPlatformScopeAsync(organizationId, platformWorkspaceId);

        Assert.NotNull(loaded);
        Assert.Equal(workspace.Id, loaded.Id);
    }

    [Fact]
    public async Task SaveChanges_persists_status_currency_and_updated_at_mutations()
    {
        var workspace = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            new PlatformOrganizationId(Guid.Parse("55555555-5555-5555-5555-555555555555")),
            new PlatformWorkspaceId(Guid.Parse("66666666-6666-6666-6666-666666666666")),
            "Lifecycle Finance",
            "USD",
            T0);

        await _repository.AddAsync(workspace);
        await _repository.SaveChangesAsync();

        workspace.Suspend(T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new FinanceWorkspaceRepository(readContext).GetByIdAsync(workspace.Id);

        Assert.NotNull(loaded);
        Assert.Equal(FinanceWorkspaceStatus.Suspended, loaded.Status);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Equal(new Currency("USD"), loaded.DefaultCurrency);
    }

    [Fact]
    public async Task Unique_platform_scope_index_rejects_duplicates()
    {
        var organizationId = new PlatformOrganizationId(Guid.Parse("77777777-7777-7777-7777-777777777777"));
        var platformWorkspaceId = new PlatformWorkspaceId(Guid.Parse("88888888-8888-8888-8888-888888888888"));

        var first = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            organizationId,
            platformWorkspaceId,
            "First",
            "UAH",
            T0);
        await _repository.AddAsync(first);
        await _repository.SaveChangesAsync();

        await using var secondContext = CreateContext();
        var secondRepository = new FinanceWorkspaceRepository(secondContext);
        var second = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            organizationId,
            platformWorkspaceId,
            "Second",
            "EUR",
            T0);
        await secondRepository.AddAsync(second);

        await Assert.ThrowsAsync<DbUpdateException>(() => secondRepository.SaveChangesAsync());
    }

    private FinanceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<FinanceDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new FinanceDbContext(options);
    }
}
