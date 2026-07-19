using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.GeneralLedger.Queries;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.GeneralLedger.Handlers;

public sealed class GetAccountStatementHandler
{
    private readonly IAccountStatementReader _reader;

    public GetAccountStatementHandler(IAccountStatementReader reader)
    {
        _reader = reader;
    }

    public async Task<ApplicationResult<AccountStatementDto>> HandleAsync(
        GetAccountStatementQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccountId accountId;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            accountId = new AccountId(query.AccountId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<AccountStatementDto>.ValidationFailed(ex.Message);
        }

        if (query.PeriodFromUtc is { } from && query.PeriodToUtc is { } to && from > to)
        {
            return ApplicationResult<AccountStatementDto>.ValidationFailed(
                "PeriodFromUtc must not be later than PeriodToUtc.");
        }

        var statement = await _reader.GetAsync(
            financeWorkspaceId,
            accountId,
            query.PeriodFromUtc,
            query.PeriodToUtc,
            cancellationToken);

        if (statement is null)
        {
            return ApplicationResult<AccountStatementDto>.NotFound("Account was not found.");
        }

        return ApplicationResult<AccountStatementDto>.Success(statement);
    }
}
