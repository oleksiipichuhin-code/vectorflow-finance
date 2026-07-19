using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.JournalEntries.Commands;
using VectorFlow.Finance.Application.JournalEntries.Handlers;
using VectorFlow.Finance.Application.JournalEntries.Queries;

namespace VectorFlow.Finance.Api.JournalEntries;

internal static class JournalEntryEndpoints
{
    public static RouteGroupBuilder MapJournalEntryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/journal-entries")
            .WithTags("JournalEntries");

        group.MapPost("/", CreateAsync)
            .WithName("CreateJournalEntry")
            .WithSummary("Create a draft journal entry in a finance workspace.")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/", ListAsync)
            .WithName("ListJournalEntries")
            .WithSummary("List journal entries for a finance workspace (newest first).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        group.MapGet("/{journalEntryId:guid}", GetByIdAsync)
            .WithName("GetJournalEntryById")
            .WithSummary("Get a journal entry by id within a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("/{journalEntryId:guid}/rename", RenameAsync)
            .WithName("RenameJournalEntry")
            .WithSummary("Rename a draft journal entry.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{journalEntryId:guid}/lines", AddLineAsync)
            .WithName("AddJournalEntryLine")
            .WithSummary("Add a debit or credit line to a draft journal entry.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPut("/{journalEntryId:guid}/lines/{lineId:guid}", UpdateLineAsync)
            .WithName("UpdateJournalEntryLine")
            .WithSummary("Replace a draft journal entry line.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapDelete("/{journalEntryId:guid}/lines/{lineId:guid}", RemoveLineAsync)
            .WithName("RemoveJournalEntryLine")
            .WithSummary("Remove a line from a draft journal entry.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapPost("/{journalEntryId:guid}/post", PostAsync)
            .WithName("PostJournalEntry")
            .WithSummary("Post a balanced draft journal entry.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        return group;
    }

    private static async Task<IResult> CreateAsync(
        Guid financeWorkspaceId,
        CreateJournalEntryRequest request,
        CreateJournalEntryHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new CreateJournalEntryCommand(financeWorkspaceId, request.Name),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result, StatusCodes.Status201Created);
    }

    private static async Task<IResult> ListAsync(
        Guid financeWorkspaceId,
        GetJournalEntriesHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetJournalEntriesQuery(financeWorkspaceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        GetJournalEntryHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetJournalEntryQuery(financeWorkspaceId, journalEntryId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> RenameAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        RenameJournalEntryRequest request,
        RenameJournalEntryHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new RenameJournalEntryCommand(financeWorkspaceId, journalEntryId, request.Name),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> AddLineAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        AddJournalEntryLineRequest request,
        AddJournalEntryLineHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new AddJournalEntryLineCommand(
                financeWorkspaceId,
                journalEntryId,
                request.FinancialAccountId,
                request.Debit,
                request.Credit,
                request.Description),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> UpdateLineAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        Guid lineId,
        UpdateJournalEntryLineRequest request,
        UpdateJournalEntryLineHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new UpdateJournalEntryLineCommand(
                financeWorkspaceId,
                journalEntryId,
                lineId,
                request.FinancialAccountId,
                request.Debit,
                request.Credit,
                request.Description),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> RemoveLineAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        Guid lineId,
        RemoveJournalEntryLineHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new RemoveJournalEntryLineCommand(financeWorkspaceId, journalEntryId, lineId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> PostAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        PostJournalEntryHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new PostJournalEntryCommand(financeWorkspaceId, journalEntryId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
