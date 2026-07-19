using VectorFlow.Finance.Domain.Ledger;

namespace VectorFlow.Finance.Application.Ledger;

internal static class LedgerPostingMapper
{
    public static LedgerPostingDto ToDto(LedgerPosting posting) =>
        new(
            posting.Id.Value,
            posting.FinanceWorkspaceId.Value,
            posting.JournalEntryId.Value,
            posting.PostedAtUtc,
            posting.Lines
                .OrderBy(line => line.Sequence)
                .Select(ToLineDto)
                .ToArray(),
            posting.TotalDebit,
            posting.TotalCredit);

    private static LedgerPostingLineDto ToLineDto(LedgerPostingLine line) =>
        new(
            line.Id.Value,
            line.SourceJournalEntryLineId.Value,
            line.FinancialAccountId.Value,
            line.Debit,
            line.Credit,
            line.Description,
            line.Sequence);
}
