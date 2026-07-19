namespace VectorFlow.Finance.Api.JournalEntries;

public sealed record CreateJournalEntryRequest(string Name);

public sealed record RenameJournalEntryRequest(string Name);

public sealed record AddJournalEntryLineRequest(
    Guid FinancialAccountId,
    decimal Debit,
    decimal Credit,
    string? Description);

public sealed record UpdateJournalEntryLineRequest(
    Guid FinancialAccountId,
    decimal Debit,
    decimal Credit,
    string? Description);
