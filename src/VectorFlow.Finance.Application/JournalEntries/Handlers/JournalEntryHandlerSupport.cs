using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

internal static class JournalEntryHandlerSupport
{
    public static async Task<ApplicationResult<JournalEntry>> LoadAsync(
        IJournalEntryRepository repository,
        Guid financeWorkspaceIdValue,
        Guid idValue,
        CancellationToken cancellationToken)
    {
        FinanceWorkspaceId financeWorkspaceId;
        JournalEntryId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(financeWorkspaceIdValue);
            id = new JournalEntryId(idValue);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<JournalEntry>.ValidationFailed(ex.Message);
        }

        var entry = await repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (entry is null)
        {
            // Missing entry and workspace mismatch both map to NotFound.
            return ApplicationResult<JournalEntry>.NotFound("Journal entry was not found.");
        }

        return ApplicationResult<JournalEntry>.Success(entry);
    }

    public static async Task<ApplicationResult<Account>> LoadAccountInWorkspaceAsync(
        IAccountRepository accountRepository,
        FinanceWorkspaceId financeWorkspaceId,
        Guid financialAccountIdValue,
        CancellationToken cancellationToken)
    {
        AccountId financialAccountId;
        try
        {
            financialAccountId = new AccountId(financialAccountIdValue);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<Account>.ValidationFailed(ex.Message);
        }

        var account = await accountRepository.GetByIdAsync(
            financeWorkspaceId,
            financialAccountId,
            cancellationToken);

        if (account is null)
        {
            // Missing account and workspace mismatch both map to NotFound.
            return ApplicationResult<Account>.NotFound("Account was not found.");
        }

        return ApplicationResult<Account>.Success(account);
    }

    public static ApplicationResult<JournalEntryDto> FromArgumentException(ArgumentException ex) =>
        ApplicationResult<JournalEntryDto>.ValidationFailed(ex.Message);

    public static ApplicationResult<JournalEntryDto> FromInvalidOperationException(InvalidOperationException ex) =>
        ApplicationResult<JournalEntryDto>.Conflict(ex.Message);
}
