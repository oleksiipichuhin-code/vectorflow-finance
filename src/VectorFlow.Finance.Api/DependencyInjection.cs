using Microsoft.Extensions.DependencyInjection;
using Microsoft.OpenApi.Models;
using VectorFlow.Finance.Application.AccountBalances.Handlers;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.Accruals.Handlers;
using VectorFlow.Finance.Application.GeneralLedger.Handlers;
using VectorFlow.Finance.Application.Invoices.Handlers;
using VectorFlow.Finance.Application.JournalEntries.Handlers;
using VectorFlow.Finance.Application.Ledger.Handlers;
using VectorFlow.Finance.Application.TrialBalances.Handlers;
using VectorFlow.Finance.Application.Workspaces.Handlers;

namespace VectorFlow.Finance.Api;

/// <summary>
/// API-layer composition: workspace, account, journal entry, ledger posting, account balance,
/// trial balance, account statement, invoice, and accrual handlers and OpenAPI/Swagger surface.
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

        services.AddScoped<CreateAccountHandler>();
        services.AddScoped<GetAccountHandler>();
        services.AddScoped<GetAccountByCodeHandler>();
        services.AddScoped<RenameAccountHandler>();
        services.AddScoped<ChangeAccountCodeHandler>();
        services.AddScoped<ChangeAccountTypeHandler>();
        services.AddScoped<ArchiveAccountHandler>();

        services.AddScoped<CreateJournalEntryHandler>();
        services.AddScoped<GetJournalEntryHandler>();
        services.AddScoped<GetJournalEntriesHandler>();
        services.AddScoped<RenameJournalEntryHandler>();
        services.AddScoped<AddJournalEntryLineHandler>();
        services.AddScoped<UpdateJournalEntryLineHandler>();
        services.AddScoped<RemoveJournalEntryLineHandler>();
        services.AddScoped<PostJournalEntryHandler>();

        services.AddScoped<PostJournalEntryToLedgerHandler>();
        services.AddScoped<GetLedgerPostingHandler>();
        services.AddScoped<GetLedgerPostingByJournalEntryHandler>();
        services.AddScoped<GetLedgerPostingsHandler>();

        services.AddScoped<GetAccountBalanceHandler>();
        services.AddScoped<GetAccountBalancesHandler>();

        services.AddScoped<GetTrialBalanceHandler>();

        services.AddScoped<GetAccountStatementHandler>();

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

        services.AddScoped<CreateAccrualHandler>();
        services.AddScoped<GetAccrualHandler>();
        services.AddScoped<GetAccrualsHandler>();
        services.AddScoped<GetAccrualsPagedHandler>();
        services.AddScoped<GetAccrualsByInvoiceHandler>();
        services.AddScoped<ChangeAccrualTypeHandler>();
        services.AddScoped<ChangeAccrualAmountHandler>();
        services.AddScoped<ChangeAccrualCurrencyHandler>();
        services.AddScoped<ChangeAccrualRecognitionDateHandler>();
        services.AddScoped<ChangeAccrualDescriptionHandler>();
        services.AddScoped<ChangeAccrualSourceInvoiceHandler>();
        services.AddScoped<RecognizeAccrualHandler>();
        services.AddScoped<ReverseAccrualHandler>();

        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "VectorFlow Finance API",
                Version = "v1",
                Description = "Finance Workspace, Account, Journal Entry, Ledger Posting, Account Balance, Trial Balance, Account Statement, Invoice, and Accrual HTTP surface."
            });
        });

        return services;
    }
}
