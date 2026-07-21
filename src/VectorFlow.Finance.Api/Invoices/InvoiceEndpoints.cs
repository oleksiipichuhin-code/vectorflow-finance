using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.Invoices.Commands;
using VectorFlow.Finance.Application.Invoices.Handlers;
using VectorFlow.Finance.Application.Invoices.Queries;

namespace VectorFlow.Finance.Api.Invoices;

internal static class InvoiceEndpoints
{
    public static RouteGroupBuilder MapInvoiceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/invoices")
            .WithTags("Invoices");

        group.MapPost("/", CreateAsync)
            .WithName("CreateInvoice")
            .WithSummary("Create a draft invoice in a finance workspace.")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/", ListAsync)
            .WithName("ListInvoices")
            .WithSummary("List invoices for a finance workspace (newest first).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        group.MapGet("/by-document-number", ListByDocumentNumberAsync)
            .WithName("ListInvoicesByDocumentNumber")
            .WithSummary("List invoices for a finance workspace by document number (newest first).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        group.MapGet("/{invoiceId:guid}", GetByIdAsync)
            .WithName("GetInvoiceById")
            .WithSummary("Get an invoice by id within a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/{invoiceId:guid}/change-document-number", ChangeDocumentNumberAsync)
            .WithName("ChangeInvoiceDocumentNumber")
            .WithSummary("Change the document number of a draft invoice.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{invoiceId:guid}/change-counterparty", ChangeCounterpartyAsync)
            .WithName("ChangeInvoiceCounterparty")
            .WithSummary("Change the counterparty reference of a draft invoice.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{invoiceId:guid}/change-currency", ChangeCurrencyAsync)
            .WithName("ChangeInvoiceCurrency")
            .WithSummary("Change the currency of a draft invoice.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{invoiceId:guid}/set-due-date", SetDueDateAsync)
            .WithName("SetInvoiceDueDate")
            .WithSummary("Set the due date of a draft invoice.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{invoiceId:guid}/lines", AddLineAsync)
            .WithName("AddInvoiceLine")
            .WithSummary("Add a commercial line to a draft invoice.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPut("/{invoiceId:guid}/lines/{lineId:guid}", UpdateLineAsync)
            .WithName("UpdateInvoiceLine")
            .WithSummary("Replace a draft invoice line.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapDelete("/{invoiceId:guid}/lines/{lineId:guid}", RemoveLineAsync)
            .WithName("RemoveInvoiceLine")
            .WithSummary("Remove a line from a draft invoice.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{invoiceId:guid}/issue", IssueAsync)
            .WithName("IssueInvoice")
            .WithSummary("Issue a draft invoice (Draft → Issued).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<IResult> CreateAsync(
        Guid financeWorkspaceId,
        CreateInvoiceRequest request,
        CreateInvoiceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new CreateInvoiceCommand(
                financeWorkspaceId,
                request.DocumentNumber,
                request.CounterpartyReference,
                request.Currency),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result, StatusCodes.Status201Created);
    }

    private static async Task<IResult> ListAsync(
        Guid financeWorkspaceId,
        GetInvoicesHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetInvoicesQuery(financeWorkspaceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ListByDocumentNumberAsync(
        Guid financeWorkspaceId,
        string? documentNumber,
        GetInvoicesByDocumentNumberHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetInvoicesByDocumentNumberQuery(financeWorkspaceId, documentNumber),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        GetInvoiceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetInvoiceByIdQuery(financeWorkspaceId, invoiceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeDocumentNumberAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        ChangeInvoiceDocumentNumberRequest request,
        ChangeInvoiceDocumentNumberHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeInvoiceDocumentNumberCommand(
                financeWorkspaceId,
                invoiceId,
                request.DocumentNumber),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeCounterpartyAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        ChangeInvoiceCounterpartyRequest request,
        ChangeInvoiceCounterpartyHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeInvoiceCounterpartyCommand(
                financeWorkspaceId,
                invoiceId,
                request.CounterpartyReference),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> ChangeCurrencyAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        ChangeInvoiceCurrencyRequest request,
        ChangeInvoiceCurrencyHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new ChangeInvoiceCurrencyCommand(
                financeWorkspaceId,
                invoiceId,
                request.Currency),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> SetDueDateAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        SetInvoiceDueDateRequest request,
        SetInvoiceDueDateHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new SetInvoiceDueDateCommand(
                financeWorkspaceId,
                invoiceId,
                request.DueDateUtc),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> AddLineAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        AddInvoiceLineRequest request,
        AddInvoiceLineHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new AddInvoiceLineCommand(
                financeWorkspaceId,
                invoiceId,
                request.Quantity,
                request.UnitPrice,
                request.Description),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> UpdateLineAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        Guid lineId,
        UpdateInvoiceLineRequest request,
        UpdateInvoiceLineHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new UpdateInvoiceLineCommand(
                financeWorkspaceId,
                invoiceId,
                lineId,
                request.Quantity,
                request.UnitPrice,
                request.Description),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> RemoveLineAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        Guid lineId,
        RemoveInvoiceLineHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new RemoveInvoiceLineCommand(financeWorkspaceId, invoiceId, lineId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> IssueAsync(
        Guid financeWorkspaceId,
        Guid invoiceId,
        IssueInvoiceHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new IssueInvoiceCommand(financeWorkspaceId, invoiceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
