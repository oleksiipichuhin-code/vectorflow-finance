using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.Accruals.Commands;
using VectorFlow.Finance.Application.Accruals.Handlers;
using VectorFlow.Finance.Application.Accruals.Queries;

namespace VectorFlow.Finance.Api.Accruals;

internal static class AccrualEndpoints
{
    public static RouteGroupBuilder MapAccrualEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/accruals")
            .WithTags("Accruals");

        group.MapPost("/", CreateAsync)
            .WithName("CreateAccrual")
            .WithSummary("Create a draft accrual in a finance workspace.")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/", ListAsync)
            .WithName("ListAccruals")
            .WithSummary("List accruals for a finance workspace (newest first).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        group.MapGet("/{accrualId:guid}", GetByIdAsync)
            .WithName("GetAccrualById")
            .WithSummary("Get an accrual by id within a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/{accrualId:guid}/change-type", ChangeTypeAsync)
            .WithName("ChangeAccrualType")
            .WithSummary("Change the type of a draft accrual.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/change-amount", ChangeAmountAsync)
            .WithName("ChangeAccrualAmount")
            .WithSummary("Change the amount of a draft accrual.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/change-currency", ChangeCurrencyAsync)
            .WithName("ChangeAccrualCurrency")
            .WithSummary("Change the currency of a draft accrual.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/change-recognition-date", ChangeRecognitionDateAsync)
            .WithName("ChangeAccrualRecognitionDate")
            .WithSummary("Change the recognition date of a draft accrual.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/change-description", ChangeDescriptionAsync)
            .WithName("ChangeAccrualDescription")
            .WithSummary("Change the description of a draft accrual.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/change-source-invoice", ChangeSourceInvoiceAsync)
            .WithName("ChangeAccrualSourceInvoice")
            .WithSummary("Set or clear the optional source invoice of a draft accrual.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/recognize", RecognizeAsync)
            .WithName("RecognizeAccrual")
            .WithSummary("Recognize a draft accrual (Draft → Recognized).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{accrualId:guid}/reverse", ReverseAsync)
            .WithName("ReverseAccrual")
            .WithSummary("Reverse a recognized accrual (Recognized → Reversed).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<IResult> CreateAsync(
        Guid financeWorkspaceId,
        CreateAccrualRequest request,
        CreateAccrualHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new CreateAccrualCommand(
                financeWorkspaceId,
                request.Type,
                request.Amount,
                request.Currency,
                request.RecognitionDateUtc,
                request.Description,
                request.SourceInvoiceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result, StatusCodes.Status201Created);
    }

    private static async Task<IResult> ListAsync(
        Guid financeWorkspaceId,
        GetAccrualsHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetAccrualsQuery(financeWorkspaceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        GetAccrualHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetAccrualByIdQuery(financeWorkspaceId, accrualId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeTypeAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ChangeAccrualTypeRequest request,
        ChangeAccrualTypeHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccrualTypeCommand(financeWorkspaceId, accrualId, request.Type),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeAmountAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ChangeAccrualAmountRequest request,
        ChangeAccrualAmountHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccrualAmountCommand(financeWorkspaceId, accrualId, request.Amount),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeCurrencyAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ChangeAccrualCurrencyRequest request,
        ChangeAccrualCurrencyHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccrualCurrencyCommand(financeWorkspaceId, accrualId, request.Currency),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeRecognitionDateAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ChangeAccrualRecognitionDateRequest request,
        ChangeAccrualRecognitionDateHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccrualRecognitionDateCommand(
                financeWorkspaceId,
                accrualId,
                request.RecognitionDateUtc),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeDescriptionAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ChangeAccrualDescriptionRequest request,
        ChangeAccrualDescriptionHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccrualDescriptionCommand(financeWorkspaceId, accrualId, request.Description),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeSourceInvoiceAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ChangeAccrualSourceInvoiceRequest request,
        ChangeAccrualSourceInvoiceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeAccrualSourceInvoiceCommand(
                financeWorkspaceId,
                accrualId,
                request.SourceInvoiceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> RecognizeAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        RecognizeAccrualHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new RecognizeAccrualCommand(financeWorkspaceId, accrualId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ReverseAsync(
        Guid financeWorkspaceId,
        Guid accrualId,
        ReverseAccrualRequest request,
        ReverseAccrualHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ReverseAccrualCommand(financeWorkspaceId, accrualId, request.Reason),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
