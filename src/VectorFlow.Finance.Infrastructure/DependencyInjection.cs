using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.Health;

namespace VectorFlow.Finance.Infrastructure;

/// <summary>
/// Composition helpers for wiring application services into the host.
/// F0 provides foundation registration only; no persistence is introduced.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddFinanceInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<HealthStatusService>();
        return services;
    }
}
