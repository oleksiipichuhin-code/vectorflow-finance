using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Ledger.Queries;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Ledger.Handlers;

public sealed class GetLedgerPostingByJournalEntryHandler
{
    private readonly ILedgerPostingRepository _repository;

    public GetLedgerPostingByJournalEntryHandler(ILedgerPostingRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<LedgerPostingDto>> HandleAsync(
        GetLedgerPostingByJournalEntryQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        JournalEntryId journalEntryId;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            journalEntryId = new JournalEntryId(query.JournalEntryId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<LedgerPostingDto>.ValidationFailed(ex.Message);
        }

        var posting = await _repository.GetByJournalEntryIdAsync(
            financeWorkspaceId,
            journalEntryId,
            cancellationToken);

        if (posting is null)
        {
            return ApplicationResult<LedgerPostingDto>.NotFound("Ledger posting was not found.");
        }

        return ApplicationResult<LedgerPostingDto>.Success(LedgerPostingMapper.ToDto(posting));
    }
}
