using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Commands;
using VectorFlow.Finance.Domain.Invoices;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class ChangeInvoiceCounterpartyHandler
{
    private readonly IInvoiceRepository _repository;
    private readonly IClock _clock;

    public ChangeInvoiceCounterpartyHandler(IInvoiceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<InvoiceDto>> HandleAsync(
        ChangeInvoiceCounterpartyCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await InvoiceHandlerSupport.LoadAsync(
            _repository,
            command.FinanceWorkspaceId,
            command.Id,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<InvoiceDto>.FromFailure(load);
        }

        CounterpartyReference counterpartyReference;
        try
        {
            counterpartyReference = new CounterpartyReference(command.CounterpartyReference);
        }
        catch (ArgumentException ex)
        {
            return InvoiceHandlerSupport.FromArgumentException(ex);
        }

        try
        {
            load.Value!.ChangeCounterpartyReference(counterpartyReference, _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return InvoiceHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return InvoiceHandlerSupport.FromInvalidOperationException(ex);
        }

        await _repository.SaveChangesAsync(cancellationToken);
        return ApplicationResult<InvoiceDto>.Success(InvoiceMapper.ToDto(load.Value));
    }
}
