using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Commands;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class ChangeAccrualRecognitionDateHandler
{
    private readonly IAccrualRepository _repository;
    private readonly IClock _clock;

    public ChangeAccrualRecognitionDateHandler(IAccrualRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccrualDto>> HandleAsync(
        ChangeAccrualRecognitionDateCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await AccrualHandlerSupport.LoadAsync(
            _repository,
            command.FinanceWorkspaceId,
            command.Id,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<AccrualDto>.FromFailure(load);
        }

        try
        {
            load.Value!.ChangeRecognitionDate(command.RecognitionDateUtc, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return AccrualHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return AccrualHandlerSupport.FromInvalidOperationException(ex);
        }

        await _repository.SaveChangesAsync(cancellationToken);
        return ApplicationResult<AccrualDto>.Success(AccrualMapper.ToDto(load.Value));
    }
}
