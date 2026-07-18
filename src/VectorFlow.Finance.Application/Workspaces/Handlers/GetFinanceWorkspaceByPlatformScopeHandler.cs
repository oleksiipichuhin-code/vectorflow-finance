using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces.Queries;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

public sealed class GetFinanceWorkspaceByPlatformScopeHandler
{
    private readonly IFinanceWorkspaceRepository _repository;

    public GetFinanceWorkspaceByPlatformScopeHandler(IFinanceWorkspaceRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<FinanceWorkspaceDto>> HandleAsync(
        GetFinanceWorkspaceByPlatformScopeQuery query,
        CancellationToken cancellationToken = default)
    {
        PlatformOrganizationId organizationId;
        PlatformWorkspaceId platformWorkspaceId;

        try
        {
            organizationId = new PlatformOrganizationId(query.PlatformOrganizationId);
            platformWorkspaceId = new PlatformWorkspaceId(query.PlatformWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<FinanceWorkspaceDto>.ValidationFailed(ex.Message);
        }

        var workspace = await _repository.GetByPlatformScopeAsync(
            organizationId,
            platformWorkspaceId,
            cancellationToken);

        if (workspace is null)
        {
            return ApplicationResult<FinanceWorkspaceDto>.NotFound("Finance workspace was not found.");
        }

        return ApplicationResult<FinanceWorkspaceDto>.Success(FinanceWorkspaceMapper.ToDto(workspace));
    }
}
