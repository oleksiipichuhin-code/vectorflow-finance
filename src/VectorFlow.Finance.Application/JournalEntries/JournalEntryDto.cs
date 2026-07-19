namespace VectorFlow.Finance.Application.JournalEntries;

public sealed record JournalEntryLineDto(
    Guid Id,
    Guid FinancialAccountId,
    decimal Debit,
    decimal Credit,
    string? Description,
    int Sequence);

public sealed record JournalEntryDto(
    Guid Id,
    Guid FinanceWorkspaceId,
    string Name,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? PostedAtUtc,
    IReadOnlyList<JournalEntryLineDto> Lines,
    decimal TotalDebit,
    decimal TotalCredit);
