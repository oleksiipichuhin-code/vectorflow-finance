using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application.AccountBalances.Handlers;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.Accruals.Handlers;
using VectorFlow.Finance.Application.GeneralLedger.Handlers;
using VectorFlow.Finance.Application.Invoices.Handlers;
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

    public static IServiceCollection AddFinanceInvoiceApplication(this IServiceCollection services)
    {
        services.AddScoped<CreateInvoiceHandler>();
        services.AddScoped<GetInvoiceHandler>();
        services.AddScoped<GetInvoicesHandler>();
        services.AddScoped<GetInvoicesPagedHandler>();
        services.AddScoped<GetInvoicesByDocumentNumberHandler>();
        services.AddScoped<ChangeInvoiceDocumentNumberHandler>();
        services.AddScoped<ChangeInvoiceCounterpartyHandler>();
        services.AddScoped<ChangeInvoiceCurrencyHandler>();
        services.AddScoped<SetInvoiceDueDateHandler>();
        services.AddScoped<AddInvoiceLineHandler>();
        services.AddScoped<UpdateInvoiceLineHandler>();
        services.AddScoped<RemoveInvoiceLineHandler>();
        services.AddScoped<IssueInvoiceHandler>();

        return services;
    }

    public static IServiceCollection AddFinanceAccrualApplication(this IServiceCollection services)
    {
        services.AddScoped<CreateAccrualHandler>();
        services.AddScoped<GetAccrualHandler>();
        services.AddScoped<GetAccrualsHandler>();
        services.AddScoped<GetAccrualsByInvoiceHandler>();
        services.AddScoped<ChangeAccrualTypeHandler>();
        services.AddScoped<ChangeAccrualAmountHandler>();
        services.AddScoped<ChangeAccrualCurrencyHandler>();
        services.AddScoped<ChangeAccrualRecognitionDateHandler>();
        services.AddScoped<ChangeAccrualDescriptionHandler>();
        services.AddScoped<ChangeAccrualSourceInvoiceHandler>();
        services.AddScoped<RecognizeAccrualHandler>();
        services.AddScoped<ReverseAccrualHandler>();

        return services;
    }
}
