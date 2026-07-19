namespace VectorFlow.Finance.Application.Ledger.Commands;

/// <summary>
/// Creates an immutable ledger posting from a posted journal entry (idempotent).
/// Distinct from <c>PostJournalEntryCommand</c>, which transitions Draft → Posted.
/// </summary>
public sealed record PostJournalEntryToLedgerCommand(
    Guid FinanceWorkspaceId,
    Guid JournalEntryId);
