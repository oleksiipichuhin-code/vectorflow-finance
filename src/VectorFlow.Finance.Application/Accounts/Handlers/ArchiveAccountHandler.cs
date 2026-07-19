using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Commands;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class ArchiveAccountHandler
{
    private readonly IAccountRepository _repository;
    private readonly IClock _clock;

    public ArchiveAccountHandler(IAccountRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccountDto>> HandleAsync(
        ArchiveAccountCommand command,
        CancellationToken cancellationToken = default)
    {
        var load = await AccountHandlerSupport.LoadAsync(
            _repository,
            command.FinanceWorkspaceId,
            command.Id,
            cancellationToken);

        if (!load.IsSuccess)
        {
            return ApplicationResult<AccountDto>.FromFailure(load);
        }

        try
        {
            load.Value!.Archive(_clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return AccountHandlerSupport.FromArgumentException(ex);
        }
        catch (InvalidOperationException ex)
        {
            return AccountHandlerSupport.FromInvalidOperationException(ex);
        }

        await _repository.SaveChangesAsync(cancellationToken);
        return ApplicationResult<AccountDto>.Success(AccountMapper.ToDto(load.Value));
    }
}
