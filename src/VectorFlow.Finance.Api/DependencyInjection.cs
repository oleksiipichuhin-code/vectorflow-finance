using Microsoft.OpenApi.Models;
using VectorFlow.Finance.Application.Workspaces.Handlers;

namespace VectorFlow.Finance.Api;

/// <summary>
/// API-layer composition: workspace handlers and OpenAPI/Swagger surface.
/// Infrastructure registrations remain in <c>AddFinanceInfrastructure</c>.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddFinanceApi(this IServiceCollection services)
    {
        services.AddScoped<CreateFinanceWorkspaceHandler>();
        services.AddScoped<GetFinanceWorkspaceHandler>();
        services.AddScoped<GetFinanceWorkspaceByPlatformScopeHandler>();
        services.AddScoped<RenameFinanceWorkspaceHandler>();
        services.AddScoped<ChangeFinanceWorkspaceDefaultCurrencyHandler>();
        services.AddScoped<UpdateFinanceWorkspaceHandler>();
        services.AddScoped<SuspendFinanceWorkspaceHandler>();
        services.AddScoped<ReactivateFinanceWorkspaceHandler>();
        services.AddScoped<ArchiveFinanceWorkspaceHandler>();

        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "VectorFlow Finance API",
                Version = "v1",
                Description = "Finance Workspace HTTP surface."
            });
        });

        return services;
    }
}
