using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces.Commands;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

public sealed class ArchiveFinanceWorkspaceHandler
{
    private readonly IFinanceWorkspaceRepository _repository;
    private readonly IClock _clock;

    public ArchiveFinanceWorkspaceHandler(IFinanceWorkspaceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<FinanceWorkspaceDto>> HandleAsync(
        ArchiveFinanceWorkspaceCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await FinanceWorkspaceHandlerSupport.LoadAsync(_repository, command.Id, cancellationToken);
        if (!load.IsSuccess)
        {
            return ApplicationResult<FinanceWorkspaceDto>.FromFailure(load);
        }

        try
        {
            load.Value!.Archive(_clock.UtcNow);
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
