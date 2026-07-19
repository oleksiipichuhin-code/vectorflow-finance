using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Application.Health;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Infrastructure;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Time;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests;

public sealed class DependencyInjectionTests
{
    [Fact]
    public void AddFinanceInfrastructure_registers_health_status_service()
    {
        var services = new ServiceCollection();
        var databasePath = Path.Combine(Path.GetTempPath(), $"vectorflow-di-health-{Guid.NewGuid():N}.db");

        services.AddFinanceInfrastructure(options => options.UseSqlite($"Data Source={databasePath}"));

        using var provider = services.BuildServiceProvider();
        var health = provider.GetRequiredService<HealthStatusService>();

        Assert.NotNull(health);
        Assert.Equal("F0", health.GetStatus().Phase);

        if (File.Exists(databasePath))
        {
            File.Delete(databasePath);
        }
    }

    [Fact]
    public void AddFinanceInfrastructure_registers_clock_repository_and_dbcontext()
    {
        var services = new ServiceCollection();
        var databasePath = Path.Combine(Path.GetTempPath(), $"vectorflow-di-regs-{Guid.NewGuid():N}.db");

        services.AddFinanceInfrastructure(options => options.UseSqlite($"Data Source={databasePath}"));

        using var provider = services.BuildServiceProvider();

        Assert.IsType<SystemClock>(provider.GetRequiredService<IClock>());
        Assert.NotNull(provider.GetRequiredService<IFinanceWorkspaceRepository>());
        Assert.NotNull(provider.GetRequiredService<IAccountRepository>());
        Assert.NotNull(provider.GetRequiredService<FinanceDbContext>());

        if (File.Exists(databasePath))
        {
            File.Delete(databasePath);
        }
    }
}
