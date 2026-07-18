using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.Health;
using VectorFlow.Finance.Infrastructure;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests;

public sealed class DependencyInjectionTests
{
    [Fact]
    public void AddFinanceInfrastructure_registers_health_status_service()
    {
        var services = new ServiceCollection();

        services.AddFinanceInfrastructure();

        using var provider = services.BuildServiceProvider();
        var health = provider.GetRequiredService<HealthStatusService>();

        Assert.NotNull(health);
        Assert.Equal("F0", health.GetStatus().Phase);
    }
}
