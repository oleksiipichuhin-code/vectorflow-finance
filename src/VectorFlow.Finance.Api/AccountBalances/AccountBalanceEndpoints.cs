using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.AccountBalances.Handlers;
using VectorFlow.Finance.Application.AccountBalances.Queries;

namespace VectorFlow.Finance.Api.AccountBalances;

internal static class AccountBalanceEndpoints
{
    public static RouteGroupBuilder MapAccountBalanceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/balances")
            .WithTags("AccountBalances");

        group.MapGet("/", ListAsync)
            .WithName("ListAccountBalances")
            .WithSummary("List account balances for a finance workspace (by account code).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        group.MapGet("/{accountId:guid}", GetByAccountIdAsync)
            .WithName("GetAccountBalanceById")
            .WithSummary("Get balance for a single account within a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        return group;
    }

    private static async Task<IResult> ListAsync(
        Guid financeWorkspaceId,
        GetAccountBalancesHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetAccountBalancesQuery(financeWorkspaceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByAccountIdAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        GetAccountBalanceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetAccountBalanceQuery(financeWorkspaceId, accountId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
