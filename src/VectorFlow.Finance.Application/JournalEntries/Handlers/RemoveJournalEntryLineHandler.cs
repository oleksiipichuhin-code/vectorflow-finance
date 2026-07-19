using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries.Commands;
using VectorFlow.Finance.Domain.JournalEntries;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

public sealed class RemoveJournalEntryLineHandler
{
    private readonly IJournalEntryRepository _repository;
    private readonly IClock _clock;

    public RemoveJournalEntryLineHandler(IJournalEntryRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<JournalEntryDto>> HandleAsync(
        RemoveJournalEntryLineCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await JournalEntryHandlerSupport.LoadAsync(
            _repository,
            command.FinanceWorkspaceId,
            command.JournalEntryId,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<JournalEntryDto>.FromFailure(load);
        }

        JournalEntryLineId lineId;
        try
        {
            lineId = new JournalEntryLineId(command.LineId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<JournalEntryDto>.ValidationFailed(ex.Message);
        }

        try
        {
            load.Value!.RemoveLine(lineId, _clock.UtcNow);
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
