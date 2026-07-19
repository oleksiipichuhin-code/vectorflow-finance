using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Commands;
using VectorFlow.Finance.Domain;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class ChangeInvoiceCurrencyHandler
{
    private readonly IInvoiceRepository _repository;
    private readonly IClock _clock;

    public ChangeInvoiceCurrencyHandler(IInvoiceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<InvoiceDto>> HandleAsync(
        ChangeInvoiceCurrencyCommand command,
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

        Currency currency;
        try
        {
            currency = new Currency(command.Currency);
        }
        catch (ArgumentException ex)
        {
            return InvoiceHandlerSupport.FromArgumentException(ex);
        }

        try
        {
            load.Value!.ChangeCurrency(currency, _clock.UtcNow);
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
