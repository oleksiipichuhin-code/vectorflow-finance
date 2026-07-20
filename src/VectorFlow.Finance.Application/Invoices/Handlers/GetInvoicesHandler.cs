using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class GetInvoicesHandler
{
    private readonly IInvoiceRepository _repository;

    public GetInvoicesHandler(IInvoiceRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<InvoiceDto>>> HandleAsync(
        GetInvoicesQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<InvoiceDto>>.ValidationFailed(ex.Message);
        }

        var invoices = await _repository.ListByWorkspaceAsync(financeWorkspaceId, cancellationToken);
        var dtos = invoices.Select(InvoiceMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<InvoiceDto>>.Success(dtos);
    }
}
