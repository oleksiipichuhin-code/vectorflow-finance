using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Commands;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class ChangeAccountTypeHandler
{
    private readonly IAccountRepository _repository;
    private readonly IClock _clock;

    public ChangeAccountTypeHandler(IAccountRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccountDto>> HandleAsync(
        ChangeAccountTypeCommand command,
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

        if (!AccountHandlerSupport.TryParseAccountType(command.Type, out var type, out var typeError))
        {
            return ApplicationResult<AccountDto>.ValidationFailed(typeError!);
        }

        try
        {
            load.Value!.ChangeType(type, _clock.UtcNow);
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
