using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Commands;
using VectorFlow.Finance.Domain;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class ChangeAccrualCurrencyHandler
{
    private readonly IAccrualRepository _repository;
    private readonly IClock _clock;

    public ChangeAccrualCurrencyHandler(IAccrualRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccrualDto>> HandleAsync(
        ChangeAccrualCurrencyCommand command,
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

        Currency currency;
        try
        {
            currency = new Currency(command.Currency);
        }
        catch (ArgumentException ex)
        {
            return AccrualHandlerSupport.FromArgumentException(ex);
        }

        try
        {
            load.Value!.ChangeCurrency(currency, _clock.UtcNow);
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
