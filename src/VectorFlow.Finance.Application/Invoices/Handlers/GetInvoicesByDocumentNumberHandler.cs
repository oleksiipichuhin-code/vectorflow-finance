using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class GetInvoicesByDocumentNumberHandler
{
    private readonly IInvoiceRepository _repository;

    public GetInvoicesByDocumentNumberHandler(IInvoiceRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<InvoiceDto>>> HandleAsync(
        GetInvoicesByDocumentNumberQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        string documentNumber;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            documentNumber = InvoiceHandlerSupport.NormalizeDocumentNumber(query.DocumentNumber);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<InvoiceDto>>.ValidationFailed(ex.Message);
        }

        var invoices = await _repository.ListByDocumentNumberAsync(
            financeWorkspaceId,
            documentNumber,
            cancellationToken);
        var dtos = invoices.Select(InvoiceMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<InvoiceDto>>.Success(dtos);
    }
}
