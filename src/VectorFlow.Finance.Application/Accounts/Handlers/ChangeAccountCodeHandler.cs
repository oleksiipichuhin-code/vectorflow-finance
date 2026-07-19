using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Commands;
using VectorFlow.Finance.Domain.Accounts;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class ChangeAccountCodeHandler
{
    private readonly IAccountRepository _repository;
    private readonly IClock _clock;

    public ChangeAccountCodeHandler(IAccountRepository repository, IClock clock)
    {
        _repository = repository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccountDto>> HandleAsync(
        ChangeAccountCodeCommand command,
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

        AccountCode code;
        try
        {
            code = new AccountCode(command.Code);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountDto>.ValidationFailed(ex.Message);
        }

        var account = load.Value!;
        if (!account.Code.Equals(code))
        {
            var existing = await _repository.GetByWorkspaceAndCodeAsync(
                account.FinanceWorkspaceId,
                code,
                cancellationToken);

            if (existing is not null && existing.Id != account.Id)
            {
                return ApplicationResult<AccountDto>.Conflict(
                    "An account with the specified code already exists in this finance workspace.");
            }
        }

        try
        {
            account.ChangeCode(code, _clock.UtcNow);
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
        return ApplicationResult<AccountDto>.Success(AccountMapper.ToDto(account));
    }
}
