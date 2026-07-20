using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Queries;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class GetAccrualsByInvoiceHandler
{
    private readonly IAccrualRepository _repository;

    public GetAccrualsByInvoiceHandler(IAccrualRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<AccrualDto>>> HandleAsync(
        GetAccrualsByInvoiceQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        InvoiceId sourceInvoiceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            sourceInvoiceId = new InvoiceId(query.InvoiceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<AccrualDto>>.ValidationFailed(ex.Message);
        }

        var accruals = await _repository.ListBySourceInvoiceAsync(
            financeWorkspaceId,
            sourceInvoiceId,
            cancellationToken);
        var dtos = accruals.Select(AccrualMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<AccrualDto>>.Success(dtos);
    }
}
