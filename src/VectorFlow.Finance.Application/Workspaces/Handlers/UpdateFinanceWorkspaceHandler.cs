using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces.Commands;

namespace VectorFlow.Finance.Application.Workspaces.Handlers;

public sealed class UpdateFinanceWorkspaceHandler
{
    private readonly IFinanceWorkspaceRepository _repository;
    private readonly IClock _clock;

    public UpdateFinanceWorkspaceHandler(IFinanceWorkspaceRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<FinanceWorkspaceDto>> HandleAsync(
        UpdateFinanceWorkspaceCommand command,
        CancellationToken cancellationToken = default)
    {
        var hasName = !string.IsNullOrWhiteSpace(command.Name);
        var hasCurrency = !string.IsNullOrWhiteSpace(command.DefaultCurrency);

        if (!hasName && !hasCurrency)
        {
            return ApplicationResult<FinanceWorkspaceDto>.ValidationFailed(
                "At least one of name or defaultCurrency must be provided.");
        }

        var load = await FinanceWorkspaceHandlerSupport.LoadAsync(_repository, command.Id, cancellationToken);
        if (!load.IsSuccess)
        {
            return ApplicationResult<FinanceWorkspaceDto>.FromFailure(load);
        }

        var workspace = load.Value!;
        var occurredAt = _clock.UtcNow;

        try
        {
            // Apply rename first, then currency. Both mutate in memory; SaveChanges runs once.
            if (hasName)
            {
                workspace.Rename(command.Name!, occurredAt);
            }

            if (hasCurrency)
            {
                workspace.ChangeDefaultCurrency(command.DefaultCurrency!, occurredAt);
            }
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
        return ApplicationResult<FinanceWorkspaceDto>.Success(FinanceWorkspaceMapper.ToDto(workspace));
    }
}
