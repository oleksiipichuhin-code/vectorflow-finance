using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.JournalEntries;

public sealed record JournalEntryCreated(
    JournalEntryId JournalEntryId,
    FinanceWorkspaceId FinanceWorkspaceId,
    string Name,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record JournalEntryPosted(
    JournalEntryId JournalEntryId,
    FinanceWorkspaceId FinanceWorkspaceId,
    DateTimeOffset OccurredAt) : IDomainEvent;
