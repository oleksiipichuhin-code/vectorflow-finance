using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Ledger;

public sealed record LedgerPostingCreated(
    LedgerPostingId LedgerPostingId,
    FinanceWorkspaceId FinanceWorkspaceId,
    JournalEntryId JournalEntryId,
    DateTimeOffset PostedAtUtc) : IDomainEvent;
