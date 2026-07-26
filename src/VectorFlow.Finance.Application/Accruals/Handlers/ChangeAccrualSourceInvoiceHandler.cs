using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Commands;
using VectorFlow.Finance.Application.Invoices;
using VectorFlow.Finance.Domain.Invoices;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class ChangeAccrualSourceInvoiceHandler
{
    private readonly IAccrualRepository _repository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IClock _clock;

    public ChangeAccrualSourceInvoiceHandler(
        IAccrualRepository repository,
        IInvoiceRepository invoiceRepository,
        IClock clock)
    {
        _repository = repository;
        _invoiceRepository = invoiceRepository;
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

        if (sourceInvoiceId is not null)
        {
            var sourceLoad = await AccrualHandlerSupport.LoadSourceInvoiceInWorkspaceAsync(
                _invoiceRepository,
                load.Value!.FinanceWorkspaceId,
                sourceInvoiceId.Value,
                cancellationToken);

            if (!sourceLoad.IsSuccess)
            {
                return ApplicationResult<AccrualDto>.FromFailure(sourceLoad);
            }
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

        return await AccrualHandlerSupport.SaveAsync(_repository, load.Value, cancellationToken);
    }
}
