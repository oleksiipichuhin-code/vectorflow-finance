using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.Accounts.Handlers;

namespace VectorFlow.Finance.Application;

/// <summary>
/// Application-layer composition for Account use-case handlers (F2B).
/// Repository and clock implementations remain in Infrastructure.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddFinanceAccountApplication(this IServiceCollection services)
    {
        services.AddScoped<CreateAccountHandler>();
        services.AddScoped<GetAccountHandler>();
        services.AddScoped<GetAccountByCodeHandler>();
        services.AddScoped<RenameAccountHandler>();
        services.AddScoped<ChangeAccountCodeHandler>();
        services.AddScoped<ChangeAccountTypeHandler>();
        services.AddScoped<ArchiveAccountHandler>();

        return services;
    }
}
