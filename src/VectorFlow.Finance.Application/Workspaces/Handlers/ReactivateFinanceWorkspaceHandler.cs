using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces.Commands;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

public sealed class ReactivateFinanceWorkspaceHandler
{
    private readonly IFinanceWorkspaceRepository _repository;
    private readonly IClock _clock;

    public ReactivateFinanceWorkspaceHandler(IFinanceWorkspaceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<FinanceWorkspaceDto>> HandleAsync(
        ReactivateFinanceWorkspaceCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await FinanceWorkspaceHandlerSupport.LoadAsync(_repository, command.Id, cancellationToken);
        if (!load.IsSuccess)
        {
            return ApplicationResult<FinanceWorkspaceDto>.FromFailure(load);
        }

        try
        {
            load.Value!.Reactivate(_clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return FinanceWorkspaceHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return FinanceWorkspaceHandlerSupport.FromInvalidOperationException(ex);
        }

        await _repository.SaveChangesAsync(cancellationToken);
        return ApplicationResult<FinanceWorkspaceDto>.Success(FinanceWorkspaceMapper.ToDto(load.Value));
    }
}
