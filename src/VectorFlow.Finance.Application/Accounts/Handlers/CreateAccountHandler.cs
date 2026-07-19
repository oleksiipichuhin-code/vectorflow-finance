using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Commands;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class CreateAccountHandler
{
    private readonly IAccountRepository _accountRepository;
    private readonly IFinanceWorkspaceRepository _workspaceRepository;
    private readonly IClock _clock;

    public CreateAccountHandler(
        IAccountRepository accountRepository,
        IFinanceWorkspaceRepository workspaceRepository,
        IClock clock)
    {
        _accountRepository = accountRepository;
        _workspaceRepository = workspaceRepository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccountDto>> HandleAsync(
        CreateAccountCommand command,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccountCode code;
        AccountType type;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(command.FinanceWorkspaceId);
            code = new AccountCode(command.Code);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountDto>.ValidationFailed(ex.Message);
        }

        if (!AccountHandlerSupport.TryParseAccountType(command.Type, out type, out var typeError))
        {
            return ApplicationResult<AccountDto>.ValidationFailed(typeError!);
        }

        var workspace = await _workspaceRepository.GetByIdAsync(financeWorkspaceId, cancellationToken);
        if (workspace is null)
        {
            return ApplicationResult<AccountDto>.NotFound("Finance workspace was not found.");
        }

        var existing = await _accountRepository.GetByWorkspaceAndCodeAsync(
            financeWorkspaceId,
            code,
            cancellationToken);

        if (existing is not null)
        {
            return ApplicationResult<AccountDto>.Conflict(
                "An account with the specified code already exists in this finance workspace.");
        }

        Account account;
        try
        {
            account = Account.Create(
                AccountId.New(),
                financeWorkspaceId,
                code,
                command.Name,
                type,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountDto>.ValidationFailed(ex.Message);
        }

        await _accountRepository.AddAsync(account, cancellationToken);
        await _accountRepository.SaveChangesAsync(cancellationToken);

        return ApplicationResult<AccountDto>.Success(AccountMapper.ToDto(account));
    }
}
