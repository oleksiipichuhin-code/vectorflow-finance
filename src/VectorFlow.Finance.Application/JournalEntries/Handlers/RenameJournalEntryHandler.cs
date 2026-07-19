using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries.Commands;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

public sealed class RenameJournalEntryHandler
{
    private readonly IJournalEntryRepository _repository;
    private readonly IClock _clock;

    public RenameJournalEntryHandler(IJournalEntryRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<JournalEntryDto>> HandleAsync(
        RenameJournalEntryCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await JournalEntryHandlerSupport.LoadAsync(
            _repository,
            command.FinanceWorkspaceId,
            command.Id,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<JournalEntryDto>.FromFailure(load);
        }

        try
        {
            load.Value!.Rename(command.Name, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return JournalEntryHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return JournalEntryHandlerSupport.FromInvalidOperationException(ex);
        }

        await _repository.SaveChangesAsync(cancellationToken);
        return ApplicationResult<JournalEntryDto>.Success(JournalEntryMapper.ToDto(load.Value));
    }
}
