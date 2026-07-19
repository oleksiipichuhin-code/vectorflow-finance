using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Queries;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class GetAccountByCodeHandler
{
    private readonly IAccountRepository _repository;

    public GetAccountByCodeHandler(IAccountRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<AccountDto>> HandleAsync(
        GetAccountByCodeQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccountCode code;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            code = new AccountCode(query.Code);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountDto>.ValidationFailed(ex.Message);
        }

        var account = await _repository.GetByWorkspaceAndCodeAsync(
            financeWorkspaceId,
            code,
            cancellationToken);

        if (account is null)
        {
            return ApplicationResult<AccountDto>.NotFound("Account was not found.");
        }

        return ApplicationResult<AccountDto>.Success(AccountMapper.ToDto(account));
    }
}
