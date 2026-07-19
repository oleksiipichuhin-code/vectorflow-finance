namespace VectorFlow.Finance.Application.Ledger.Queries;

public sealed record GetLedgerPostingQuery(
    Guid FinanceWorkspaceId,
    Guid Id);

public sealed record GetLedgerPostingByJournalEntryQuery(
    Guid FinanceWorkspaceId,
    Guid JournalEntryId);

public sealed record GetLedgerPostingsQuery(
    Guid FinanceWorkspaceId);
