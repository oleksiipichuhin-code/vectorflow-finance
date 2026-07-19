using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.Accounts.Commands;
using VectorFlow.Finance.Application.Accounts.Handlers;
using VectorFlow.Finance.Application.Accounts.Queries;
using VectorFlow.Finance.Contracts.Accounts;

namespace VectorFlow.Finance.Api.Accounts;

internal static class AccountEndpoints
{
    public static RouteGroupBuilder MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/accounts")
            .WithTags("Accounts");

        group.MapPost("/", CreateAsync)
            .WithName("CreateAccount")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapGet("/by-code", GetByCodeAsync)
            .WithName("GetAccountByCode")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/{accountId:guid}", GetByIdAsync)
            .WithName("GetAccountById")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/{accountId:guid}/rename", RenameAsync)
            .WithName("RenameAccount")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accountId:guid}/change-code", ChangeCodeAsync)
            .WithName("ChangeAccountCode")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accountId:guid}/change-type", ChangeTypeAsync)
            .WithName("ChangeAccountType")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accountId:guid}/archive", ArchiveAsync)
            .WithName("ArchiveAccount")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<IResult> CreateAsync(
        Guid financeWorkspaceId,
        CreateAccountRequest request,
        CreateAccountHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new CreateAccountCommand(
                financeWorkspaceId,
                request.Code,
                request.Name,
                request.Type),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result, StatusCodes.Status201Created);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        GetAccountHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetAccountQuery(financeWorkspaceId, accountId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByCodeAsync(
        Guid financeWorkspaceId,
        string? code,
        GetAccountByCodeHandler handler,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Results.Json(
                new
                {
                    error = "ValidationFailed",
                    message = "The code query parameter is required."
                },
                statusCode: StatusCodes.Status400BadRequest);
        }

        var result = await handler.HandleAsync(
            new GetAccountByCodeQuery(financeWorkspaceId, code),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> RenameAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        RenameAccountRequest request,
        RenameAccountHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new RenameAccountCommand(financeWorkspaceId, accountId, request.Name),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeCodeAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        ChangeAccountCodeRequest request,
        ChangeAccountCodeHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccountCodeCommand(financeWorkspaceId, accountId, request.Code),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeTypeAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        ChangeAccountTypeRequest request,
        ChangeAccountTypeHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccountTypeCommand(financeWorkspaceId, accountId, request.Type),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ArchiveAsync(
        Guid financeWorkspaceId,
        Guid accountId,
        ArchiveAccountHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ArchiveAccountCommand(financeWorkspaceId, accountId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
