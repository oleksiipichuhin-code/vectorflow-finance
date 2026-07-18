using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

internal static class FinanceWorkspaceHandlerSupport
{
    public static async Task<ApplicationResult<FinanceWorkspace>> LoadAsync(
        IFinanceWorkspaceRepository repository,
        Guid idValue,
        CancellationToken cancellationToken)
    {
        FinanceWorkspaceId id;
        try
        {
            id = new FinanceWorkspaceId(idValue);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<FinanceWorkspace>.ValidationFailed(ex.Message);
        }

        var workspace = await repository.GetByIdAsync(id, cancellationToken);
        if (workspace is null)
        {
            return ApplicationResult<FinanceWorkspace>.NotFound("Finance workspace was not found.");
        }

        return ApplicationResult<FinanceWorkspace>.Success(workspace);
    }

    public static ApplicationResult<FinanceWorkspaceDto> FromArgumentException(ArgumentException ex) =>
        ApplicationResult<FinanceWorkspaceDto>.ValidationFailed(ex.Message);

    public static ApplicationResult<FinanceWorkspaceDto> FromInvalidOperationException(InvalidOperationException ex) =>
        ApplicationResult<FinanceWorkspaceDto>.Conflict(ex.Message);
}
