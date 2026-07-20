using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Commands;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class ChangeAccrualTypeHandler
{
    private readonly IAccrualRepository _repository;
    private readonly IClock _clock;

    public ChangeAccrualTypeHandler(IAccrualRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccrualDto>> HandleAsync(
        ChangeAccrualTypeCommand command,
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

        if (!AccrualHandlerSupport.TryParseAccrualType(command.Type, out var type, out var typeError))
        {
            return ApplicationResult<AccrualDto>.ValidationFailed(typeError!);
        }

        try
        {
            load.Value!.ChangeType(type, _clock.UtcNow);
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
