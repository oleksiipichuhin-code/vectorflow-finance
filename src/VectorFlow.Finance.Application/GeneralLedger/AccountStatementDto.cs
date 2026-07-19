namespace VectorFlow.Finance.Application.GeneralLedger;

public sealed record AccountStatementLineDto(
    Guid LedgerPostingId,
    Guid JournalEntryId,
    Guid SourceJournalEntryLineId,
    int Sequence,
    DateTimeOffset PostedAtUtc,
    string? Description,
    decimal Debit,
    decimal Credit,
    decimal RunningDebit,
    decimal RunningCredit);

public sealed record AccountStatementDto(
    Guid FinanceWorkspaceId,
    Guid AccountId,
    string AccountCode,
    string AccountName,
    DateTimeOffset? PeriodFromUtc,
    DateTimeOffset? PeriodToUtc,
    decimal OpeningDebit,
    decimal OpeningCredit,
    decimal PeriodDebit,
    decimal PeriodCredit,
    decimal ClosingDebit,
    decimal ClosingCredit,
    IReadOnlyList<AccountStatementLineDto> Lines);
