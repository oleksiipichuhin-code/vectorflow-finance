using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

public sealed class CreateFinanceWorkspaceHandler
{
    private readonly IFinanceWorkspaceRepository _repository;
    private readonly IClock _clock;

    public CreateFinanceWorkspaceHandler(IFinanceWorkspaceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<FinanceWorkspaceDto>> HandleAsync(
        CreateFinanceWorkspaceCommand command,
        CancellationToken cancellationToken = default)
    {
        PlatformOrganizationId organizationId;
        PlatformWorkspaceId platformWorkspaceId;
        Currency defaultCurrency;

        try
        {
            organizationId = new PlatformOrganizationId(command.PlatformOrganizationId);
            platformWorkspaceId = new PlatformWorkspaceId(command.PlatformWorkspaceId);
            defaultCurrency = new Currency(command.DefaultCurrency);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<FinanceWorkspaceDto>.ValidationFailed(ex.Message);
        }

        var existing = await _repository.GetByPlatformScopeAsync(
            organizationId,
            platformWorkspaceId,
            cancellationToken);

        if (existing is not null)
        {
            return ApplicationResult<FinanceWorkspaceDto>.Conflict(
                "A finance workspace already exists for the specified platform organization and platform workspace scope.");
        }

        FinanceWorkspace workspace;
        try
        {
            workspace = FinanceWorkspace.Create(
                FinanceWorkspaceId.New(),
                organizationId,
                platformWorkspaceId,
                command.Name,
                defaultCurrency,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<FinanceWorkspaceDto>.ValidationFailed(ex.Message);
        }

        await _repository.AddAsync(workspace, cancellationToken);
        await _repository.SaveChangesAsync(cancellationToken);

        return ApplicationResult<FinanceWorkspaceDto>.Success(FinanceWorkspaceMapper.ToDto(workspace));
    }
}
