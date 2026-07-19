using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Ledger.Handlers;

internal static class LedgerPostingHandlerSupport
{
    public static async Task<ApplicationResult<(FinanceWorkspaceId WorkspaceId, JournalEntryId JournalEntryId)>>
        ParseIdsAsync(Guid financeWorkspaceIdValue, Guid journalEntryIdValue)
    {
        try
        {
            var financeWorkspaceId = new FinanceWorkspaceId(financeWorkspaceIdValue);
            var journalEntryId = new JournalEntryId(journalEntryIdValue);
            return ApplicationResult<(FinanceWorkspaceId, JournalEntryId)>.Success(
                (financeWorkspaceId, journalEntryId));
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<(FinanceWorkspaceId, JournalEntryId)>.ValidationFailed(ex.Message);
        }
    }

    public static ApplicationResult<LedgerPostingDto> FromArgumentException(ArgumentException ex) =>
        ApplicationResult<LedgerPostingDto>.ValidationFailed(ex.Message);

    public static ApplicationResult<LedgerPostingDto> FromInvalidOperationException(InvalidOperationException ex) =>
        ApplicationResult<LedgerPostingDto>.Conflict(ex.Message);
}
