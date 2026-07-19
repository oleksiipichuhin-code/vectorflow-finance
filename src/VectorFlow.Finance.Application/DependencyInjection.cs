using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.AccountBalances.Handlers;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.GeneralLedger.Handlers;
using VectorFlow.Finance.Application.JournalEntries.Handlers;
using VectorFlow.Finance.Application.Ledger.Handlers;
using VectorFlow.Finance.Application.TrialBalances.Handlers;

namespace VectorFlow.Finance.Application;

/// <summary>
/// Application-layer composition for use-case handlers.
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

    public static IServiceCollection AddFinanceJournalEntryApplication(this IServiceCollection services)
    {
        services.AddScoped<CreateJournalEntryHandler>();
        services.AddScoped<GetJournalEntryHandler>();
        services.AddScoped<GetJournalEntriesHandler>();
        services.AddScoped<RenameJournalEntryHandler>();
        services.AddScoped<AddJournalEntryLineHandler>();
        services.AddScoped<UpdateJournalEntryLineHandler>();
        services.AddScoped<RemoveJournalEntryLineHandler>();
        services.AddScoped<PostJournalEntryHandler>();

        return services;
    }

    public static IServiceCollection AddFinanceLedgerPostingApplication(this IServiceCollection services)
    {
        services.AddScoped<PostJournalEntryToLedgerHandler>();
        services.AddScoped<GetLedgerPostingHandler>();
        services.AddScoped<GetLedgerPostingByJournalEntryHandler>();
        services.AddScoped<GetLedgerPostingsHandler>();

        return services;
    }

    public static IServiceCollection AddFinanceAccountBalanceApplication(this IServiceCollection services)
    {
        services.AddScoped<GetAccountBalanceHandler>();
        services.AddScoped<GetAccountBalancesHandler>();

        return services;
    }

    public static IServiceCollection AddFinanceTrialBalanceApplication(this IServiceCollection services)
    {
        services.AddScoped<GetTrialBalanceHandler>();

        return services;
    }

    public static IServiceCollection AddFinanceGeneralLedgerApplication(this IServiceCollection services)
    {
        services.AddScoped<GetAccountStatementHandler>();

        return services;
    }
}
