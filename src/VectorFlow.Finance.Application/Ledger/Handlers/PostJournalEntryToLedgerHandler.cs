using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries;
using VectorFlow.Finance.Application.Ledger.Commands;
using VectorFlow.Finance.Domain.Ledger;

namespace VectorFlow.Finance.Application.Ledger.Handlers;

public sealed class PostJournalEntryToLedgerHandler
{
    private readonly IJournalEntryRepository _journalEntryRepository;
    private readonly ILedgerPostingRepository _ledgerPostingRepository;

    public PostJournalEntryToLedgerHandler(
        IJournalEntryRepository journalEntryRepository,
        ILedgerPostingRepository ledgerPostingRepository)
    {
        _journalEntryRepository = journalEntryRepository;
        _ledgerPostingRepository = ledgerPostingRepository;
    }

    public async Task<ApplicationResult<LedgerPostingDto>> HandleAsync(
        PostJournalEntryToLedgerCommand command,
        CancellationToken cancellationToken = default)
    {
        var ids = await LedgerPostingHandlerSupport.ParseIdsAsync(
            command.FinanceWorkspaceId,
            command.JournalEntryId);

        if (!ids.IsSuccess)
        {
            return ApplicationResult<LedgerPostingDto>.FromFailure(ids);
        }

        var (financeWorkspaceId, journalEntryId) = ids.Value;

        var existing = await _ledgerPostingRepository.GetByJournalEntryIdAsync(
            financeWorkspaceId,
            journalEntryId,
            cancellationToken);

        if (existing is not null)
        {
            return ApplicationResult<LedgerPostingDto>.Success(LedgerPostingMapper.ToDto(existing));
        }

        var journalEntry = await _journalEntryRepository.GetByIdAsync(
            financeWorkspaceId,
            journalEntryId,
            cancellationToken);

        if (journalEntry is null)
        {
            return ApplicationResult<LedgerPostingDto>.NotFound("Journal entry was not found.");
        }

        LedgerPosting posting;
        try
        {
            posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), journalEntry);
        }
        catch (ArgumentException ex)
        {
            return LedgerPostingHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return LedgerPostingHandlerSupport.FromInvalidOperationException(ex);
        }

        await _ledgerPostingRepository.AddAsync(posting, cancellationToken);

        try
        {
            await _ledgerPostingRepository.SaveChangesAsync(cancellationToken);
        }
        catch (UniqueConstraintViolationException)
        {
            var raced = await _ledgerPostingRepository.GetByJournalEntryIdAsync(
                financeWorkspaceId,
                journalEntryId,
                cancellationToken);

            if (raced is not null)
            {
                return ApplicationResult<LedgerPostingDto>.Success(LedgerPostingMapper.ToDto(raced));
            }

            throw;
        }

        return ApplicationResult<LedgerPostingDto>.Success(LedgerPostingMapper.ToDto(posting));
    }
}
