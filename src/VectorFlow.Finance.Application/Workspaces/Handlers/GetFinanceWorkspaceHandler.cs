using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

public sealed class GetFinanceWorkspaceHandler
{
    private readonly IFinanceWorkspaceRepository _repository;

    public GetFinanceWorkspaceHandler(IFinanceWorkspaceRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<FinanceWorkspaceDto>> HandleAsync(
        GetFinanceWorkspaceQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId id;
        try
        {
            id = new FinanceWorkspaceId(query.Id);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<FinanceWorkspaceDto>.ValidationFailed(ex.Message);
        }

        var workspace = await _repository.GetByIdAsync(id, cancellationToken);
        if (workspace is null)
        {
            return ApplicationResult<FinanceWorkspaceDto>.NotFound("Finance workspace was not found.");
        }

        return ApplicationResult<FinanceWorkspaceDto>.Success(FinanceWorkspaceMapper.ToDto(workspace));
    }
}
