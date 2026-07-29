using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accounts.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

public sealed class GetAccountsHandler
{
    private readonly IAccountRepository _repository;

    public GetAccountsHandler(IAccountRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<AccountDto>>> HandleAsync(
        GetAccountsQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<AccountDto>>.ValidationFailed(ex.Message);
        }

        var accounts = await _repository.ListByWorkspaceAsync(financeWorkspaceId, cancellationToken);
        var dtos = accounts.Select(AccountMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<AccountDto>>.Success(dtos);
    }
}
