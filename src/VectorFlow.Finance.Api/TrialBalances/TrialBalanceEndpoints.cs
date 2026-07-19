using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.TrialBalances.Handlers;
using VectorFlow.Finance.Application.TrialBalances.Queries;

namespace VectorFlow.Finance.Api.TrialBalances;

internal static class TrialBalanceEndpoints
{
    public static RouteGroupBuilder MapTrialBalanceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/trial-balance")
            .WithTags("TrialBalances");

        group.MapGet("/", GetAsync)
            .WithName("GetTrialBalance")
            .WithSummary("Get the trial balance for a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        return group;
    }

    private static async Task<IResult> GetAsync(
        Guid financeWorkspaceId,
        GetTrialBalanceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetTrialBalanceQuery(financeWorkspaceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
