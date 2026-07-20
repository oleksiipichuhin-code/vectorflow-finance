using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Application.GeneralLedger;
using VectorFlow.Finance.Application.Health;
using VectorFlow.Finance.Application.Invoices;
using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Application.Ledger;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Infrastructure.GeneralLedger;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using VectorFlow.Finance.Infrastructure.Time;

namespace VectorFlow.Finance.Infrastructure;

/// <summary>
/// Composition helpers for wiring application and infrastructure services into the host.
/// </summary>
public static class DependencyInjection
{
    public const string DefaultConnectionStringName = "Finance";
    public const string DefaultSqliteConnectionString = "Data Source=vectorflow-finance.db";

    public static IServiceCollection AddFinanceInfrastructure(this IServiceCollection services)
    {
        return AddFinanceInfrastructure(services, configureDbContext: null);
    }

    public static IServiceCollection AddFinanceInfrastructure(
        this IServiceCollection services,
        Action<DbContextOptionsBuilder>? configureDbContext)
    {
        services.AddSingleton<HealthStatusService>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IFinanceWorkspaceRepository, FinanceWorkspaceRepository>();
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<IJournalEntryRepository, JournalEntryRepository>();
        services.AddScoped<IInvoiceRepository, InvoiceRepository>();
        services.AddScoped<IAccrualRepository, AccrualRepository>();
        services.AddScoped<ILedgerPostingRepository, LedgerPostingRepository>();
        services.AddScoped<IAccountBalanceReader, AccountBalanceReader>();
        services.AddScoped<IAccountStatementReader, AccountStatementReader>();

        services.AddDbContext<FinanceDbContext>((serviceProvider, options) =>
        {
            if (configureDbContext is not null)
            {
                configureDbContext(options);
                return;
            }

            var configuration = serviceProvider.GetService<IConfiguration>();
            var connectionString =
                configuration?.GetConnectionString(DefaultConnectionStringName)
                ?? DefaultSqliteConnectionString;

            options.UseSqlite(connectionString);
        });

        return services;
    }
}
