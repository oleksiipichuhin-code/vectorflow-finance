using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Commands;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class AddInvoiceLineHandler
{
    private readonly IInvoiceRepository _repository;
    private readonly IClock _clock;

    public AddInvoiceLineHandler(IInvoiceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<InvoiceDto>> HandleAsync(
        AddInvoiceLineCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await InvoiceHandlerSupport.LoadAsync(
            _repository,
            command.FinanceWorkspaceId,
            command.InvoiceId,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<InvoiceDto>.FromFailure(load);
        }

        try
        {
            load.Value!.AddLine(
                command.Quantity,
                command.UnitPrice,
                command.Description,
                _clock.UtcNow);
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
