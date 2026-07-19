using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Queries;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class GetAccountHandler
{
    private readonly IAccountRepository _repository;

    public GetAccountHandler(IAccountRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<AccountDto>> HandleAsync(
        GetAccountQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccountId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            id = new AccountId(query.Id);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountDto>.ValidationFailed(ex.Message);
        }

        var account = await _repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (account is null)
        {
            return ApplicationResult<AccountDto>.NotFound("Account was not found.");
        }

        return ApplicationResult<AccountDto>.Success(AccountMapper.ToDto(account));
    }
}
