using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.GeneralLedger.Handlers;
using VectorFlow.Finance.Application.GeneralLedger.Queries;

namespace VectorFlow.Finance.Api.GeneralLedger;

internal static class AccountStatementEndpoints
{
    public static RouteGroupBuilder MapAccountStatementEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/accounts/{accountId:guid}/statement")
            .WithTags("AccountStatements");

        group.MapGet("/", GetAsync)
            .WithName("GetAccountStatement")
            .WithSummary("Get the general ledger account statement for an account, optionally filtered by period.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        return group;
    }

    private static async Task<IResult> GetAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        DateTimeOffset? periodFromUtc,
        DateTimeOffset? periodToUtc,
        GetAccountStatementHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetAccountStatementQuery(financeWorkspaceId, accountId, periodFromUtc, periodToUtc),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
