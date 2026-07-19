using VectorFlow.Finance.Domain.JournalEntries;

namespace VectorFlow.Finance.Application.JournalEntries;

internal static class JournalEntryMapper
{
    public static JournalEntryDto ToDto(JournalEntry entry) =>
        new(
            entry.Id.Value,
            entry.FinanceWorkspaceId.Value,
            entry.Name,
            entry.Status.ToString(),
            entry.CreatedAt,
            entry.UpdatedAt,
            entry.PostedAt,
            entry.Lines
                .OrderBy(line => line.Sequence)
                .Select(ToLineDto)
                .ToArray(),
            entry.TotalDebit,
            entry.TotalCredit);

    private static JournalEntryLineDto ToLineDto(JournalEntryLine line) =>
        new(
            line.Id.Value,
            line.FinancialAccountId.Value,
            line.Debit,
            line.Credit,
            line.Description,
            line.Sequence);
}
