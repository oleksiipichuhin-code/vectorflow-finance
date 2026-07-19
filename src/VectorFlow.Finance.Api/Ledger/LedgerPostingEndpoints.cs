using VectorFlow.Finance.Api.Http;
using VectorFlow.Finance.Application.Ledger.Commands;
using VectorFlow.Finance.Application.Ledger.Handlers;
using VectorFlow.Finance.Application.Ledger.Queries;

namespace VectorFlow.Finance.Api.Ledger;

internal static class LedgerPostingEndpoints
{
    public static RouteGroupBuilder MapLedgerPostingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/finance-workspaces/{financeWorkspaceId:guid}/ledger")
            .WithTags("LedgerPostings");

        group.MapPost("/post", PostAsync)
            .WithName("PostJournalEntryToLedger")
            .WithSummary("Create an immutable ledger posting from a posted journal entry (idempotent).")
            .Produces(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status409Conflict);

        group.MapGet("/", ListAsync)
            .WithName("ListLedgerPostings")
            .WithSummary("List ledger postings for a finance workspace (newest first).")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);

        group.MapGet("/by-journal/{journalEntryId:guid}", GetByJournalEntryAsync)
            .WithName("GetLedgerPostingByJournalEntry")
            .WithSummary("Get a ledger posting by source journal entry id within a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/{ledgerPostingId:guid}", GetByIdAsync)
            .WithName("GetLedgerPostingById")
            .WithSummary("Get a ledger posting by id within a finance workspace.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound);

        return group;
    }

    private static async Task<IResult> PostAsync(
        Guid financeWorkspaceId,
        PostJournalEntryToLedgerRequest request,
        PostJournalEntryToLedgerHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new PostJournalEntryToLedgerCommand(financeWorkspaceId, request.JournalEntryId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result, StatusCodes.Status201Created);
    }

    private static async Task<IResult> ListAsync(
        Guid financeWorkspaceId,
        GetLedgerPostingsHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetLedgerPostingsQuery(financeWorkspaceId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByJournalEntryAsync(
        Guid financeWorkspaceId,
        Guid journalEntryId,
        GetLedgerPostingByJournalEntryHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetLedgerPostingByJournalEntryQuery(financeWorkspaceId, journalEntryId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }

    private static async Task<IResult> GetByIdAsync(
        Guid financeWorkspaceId,
        Guid ledgerPostingId,
        GetLedgerPostingHandler handler,
        CancellationToken cancellationToken)
    {
        var result = await handler.HandleAsync(
            new GetLedgerPostingQuery(financeWorkspaceId, ledgerPostingId),
            cancellationToken);

        return ApplicationResultHttp.ToHttpResult(result);
    }
}
