using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Commands;
using VectorFlow.Finance.Domain.Invoices;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class ChangeAccrualSourceInvoiceHandler
{
    private readonly IAccrualRepository _repository;
    private readonly IClock _clock;

    public ChangeAccrualSourceInvoiceHandler(IAccrualRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccrualDto>> HandleAsync(
        ChangeAccrualSourceInvoiceCommand command,
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

        InvoiceId? sourceInvoiceId;
        try
        {
            sourceInvoiceId = command.SourceInvoiceId is null
                ? null
                : new InvoiceId(command.SourceInvoiceId.Value);
        }
        catch (ArgumentException ex)
        {
            return AccrualHandlerSupport.FromArgumentException(ex);
        }

        try
        {
            load.Value!.ChangeSourceInvoice(sourceInvoiceId, _clock.UtcNow);
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
