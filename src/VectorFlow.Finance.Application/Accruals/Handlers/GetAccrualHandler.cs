using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Queries;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class GetAccrualHandler
{
    private readonly IAccrualRepository _repository;

    public GetAccrualHandler(IAccrualRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<AccrualDto>> HandleAsync(
        GetAccrualByIdQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccrualId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            id = new AccrualId(query.Id);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccrualDto>.ValidationFailed(ex.Message);
        }

        var accrual = await _repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (accrual is null)
        {
            return ApplicationResult<AccrualDto>.NotFound("Accrual was not found.");
        }

        return ApplicationResult<AccrualDto>.Success(AccrualMapper.ToDto(accrual));
    }
}
