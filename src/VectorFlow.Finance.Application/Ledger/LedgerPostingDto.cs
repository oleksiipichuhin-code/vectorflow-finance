namespace VectorFlow.Finance.Application.Ledger;

public sealed record LedgerPostingLineDto(
    Guid Id,
    Guid SourceJournalEntryLineId,
    Guid FinancialAccountId,
    decimal Debit,
    decimal Credit,
    string? Description,
    int Sequence);

public sealed record LedgerPostingDto(
    Guid Id,
    Guid FinanceWorkspaceId,
    Guid JournalEntryId,
    DateTimeOffset PostedAtUtc,
    IReadOnlyList<LedgerPostingLineDto> Lines,
    decimal TotalDebit,
    decimal TotalCredit);
