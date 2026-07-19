namespace VectorFlow.Finance.Application.JournalEntries.Queries;

public sealed record GetJournalEntryQuery(
    Guid FinanceWorkspaceId,
    Guid Id);

public sealed record GetJournalEntriesQuery(
    Guid FinanceWorkspaceId);
