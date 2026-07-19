using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Application.JournalEntries.Commands;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

public sealed class AddJournalEntryLineHandler
{
    private readonly IJournalEntryRepository _journalEntryRepository;
    private readonly IAccountRepository _accountRepository;
    private readonly IClock _clock;

    public AddJournalEntryLineHandler(
        IJournalEntryRepository journalEntryRepository,
        IAccountRepository accountRepository,
        IClock clock)
    {
        _journalEntryRepository = journalEntryRepository;
        _accountRepository = accountRepository;
        _clock = clock;
    }

    public async Task<ApplicationResult<JournalEntryDto>> HandleAsync(
        AddJournalEntryLineCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await JournalEntryHandlerSupport.LoadAsync(
            _journalEntryRepository,
            command.FinanceWorkspaceId,
            command.JournalEntryId,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<JournalEntryDto>.FromFailure(load);
        }

        var accountLoad = await JournalEntryHandlerSupport.LoadAccountInWorkspaceAsync(
            _accountRepository,
            load.Value!.FinanceWorkspaceId,
            command.FinancialAccountId,
            cancellationToken);

        if (!accountLoad.IsSuccess)
        {
            return ApplicationResult<JournalEntryDto>.FromFailure(accountLoad);
        }

        try
        {
            load.Value.AddLine(
                accountLoad.Value!.Id,
                command.Debit,
                command.Credit,
                command.Description,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return JournalEntryHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return JournalEntryHandlerSupport.FromInvalidOperationException(ex);
        }

        await _journalEntryRepository.SaveChangesAsync(cancellationToken);
        return ApplicationResult<JournalEntryDto>.Success(JournalEntryMapper.ToDto(load.Value));
    }
}
