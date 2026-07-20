using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class GetAccrualsHandler
{
    private readonly IAccrualRepository _repository;

    public GetAccrualsHandler(IAccrualRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<AccrualDto>>> HandleAsync(
        GetAccrualsQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<AccrualDto>>.ValidationFailed(ex.Message);
        }

        var accruals = await _repository.ListByWorkspaceAsync(financeWorkspaceId, cancellationToken);
        var dtos = accruals.Select(AccrualMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<AccrualDto>>.Success(dtos);
    }
}
