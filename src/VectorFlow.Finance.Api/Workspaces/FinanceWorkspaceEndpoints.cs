using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Application.Workspaces.Queries;
using VectorFlow.Finance.Contracts.Workspaces;

namespace VectorFlow.Finance.Api.Workspaces;

internal static class FinanceWorkspaceEndpoints
{
    public static RouteGroupBuilder MapFinanceWorkspaceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces")
            .WithTags("FinanceWorkspaces");

        group.MapPost("/", CreateAsync)
            .WithName("CreateFinanceWorkspace")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status409Conflict);

        group.MapGet("/{id:guid}", GetByIdAsync)
            .WithName("GetFinanceWorkspaceById")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/", GetByPlatformScopeAsync)
            .WithName("GetFinanceWorkspaceByPlatformScope")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPatch("/{id:guid}", UpdateAsync)
            .WithName("UpdateFinanceWorkspace")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{id:guid}/suspend", SuspendAsync)
            .WithName("SuspendFinanceWorkspace")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{id:guid}/reactivate", ReactivateAsync)
            .WithName("ReactivateFinanceWorkspace")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{id:guid}/archive", ArchiveAsync)
            .WithName("ArchiveFinanceWorkspace")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<IResult> CreateAsync(
        CreateFinanceWorkspaceRequest request,
        CreateFinanceWorkspaceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new CreateFinanceWorkspaceCommand(
                request.PlatformOrganizationId,
                request.PlatformWorkspaceId,
                request.Name,
                request.DefaultCurrency),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result, StatusCodes.Status201Created);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid id,
        GetFinanceWorkspaceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(new GetFinanceWorkspaceQuery(id), cancellationToken);
        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByPlatformScopeAsync(
        Guid? platformOrganizationId,
        Guid? platformWorkspaceId,
        GetFinanceWorkspaceByPlatformScopeHandler handler,
        CancellationToken cancellationToken)
    {
        if (platformOrganizationId is null
            || platformWorkspaceId is null
            || platformOrganizationId == Guid.Empty
            || platformWorkspaceId == Guid.Empty)
        {
            return Results.Json(
                new
                {
                    error = "ValidationFailed",
                    message = "Both platformOrganizationId and platformWorkspaceId query parameters are required."
                },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await handler.HandleAsync(
            new GetFinanceWorkspaceByPlatformScopeQuery(
                platformOrganizationId.Value,
                platformWorkspaceId.Value),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        UpdateFinanceWorkspaceRequest request,
        UpdateFinanceWorkspaceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new UpdateFinanceWorkspaceCommand(id, request.Name, request.DefaultCurrency),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> SuspendAsync(
        Guid id,
        SuspendFinanceWorkspaceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(new SuspendFinanceWorkspaceCommand(id), cancellationToken);
        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ReactivateAsync(
        Guid id,
        ReactivateFinanceWorkspaceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(new ReactivateFinanceWorkspaceCommand(id), cancellationToken);
        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ArchiveAsync(
        Guid id,
        ArchiveFinanceWorkspaceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(new ArchiveFinanceWorkspaceCommand(id), cancellationToken);
        return ApplicationResultHttp.ToHttpResult(result);
    }
}
