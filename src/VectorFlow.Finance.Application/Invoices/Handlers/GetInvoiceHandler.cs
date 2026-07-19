using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Queries;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class GetInvoiceHandler
{
    private readonly IInvoiceRepository _repository;

    public GetInvoiceHandler(IInvoiceRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<InvoiceDto>> HandleAsync(
        GetInvoiceByIdQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        InvoiceId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            id = new InvoiceId(query.Id);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<InvoiceDto>.ValidationFailed(ex.Message);
        }

        var invoice = await _repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (invoice is null)
        {
            return ApplicationResult<InvoiceDto>.NotFound("Invoice was not found.");
        }

        return ApplicationResult<InvoiceDto>.Success(InvoiceMapper.ToDto(invoice));
    }
}
