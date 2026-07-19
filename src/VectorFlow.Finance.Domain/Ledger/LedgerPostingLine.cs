using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;

namespace VectorFlow.Finance.Domain.Ledger;

/// <summary>
/// Immutable debit or credit line within a <see cref="LedgerPosting"/>.
/// Copied from a posted <see cref="JournalEntryLine"/>; no mutations after creation.
/// </summary>
public sealed class LedgerPostingLine
{
    public const int DescriptionMaxLength = 500;

    private LedgerPostingLine(
        LedgerPostingLineId id,
        JournalEntryLineId sourceJournalEntryLineId,
        AccountId financialAccountId,
        decimal debit,
        decimal credit,
        string? description,
        int sequence)
    {
        Id = id;
        SourceJournalEntryLineId = sourceJournalEntryLineId;
        FinancialAccountId = financialAccountId;
        Debit = debit;
        Credit = credit;
        Description = description;
        Sequence = sequence;
    }

    public LedgerPostingLineId Id { get; }

    public JournalEntryLineId SourceJournalEntryLineId { get; }

    public AccountId FinancialAccountId { get; }

    public decimal Debit { get; }

    public decimal Credit { get; }

    public string? Description { get; }

    public int Sequence { get; }

    /// <summary>
    /// Creates an immutable posting line. Used by <see cref="LedgerPosting.CreateFrom"/> and
    /// for direct invariant tests; orphan lines are not attached to an aggregate.
    /// </summary>
    public static LedgerPostingLine Create(
        LedgerPostingLineId id,
        JournalEntryLineId sourceJournalEntryLineId,
        AccountId financialAccountId,
        decimal debit,
        decimal credit,
        string? description,
        int sequence)
    {
        EnsureNonEmpty(id);
        EnsureNonEmpty(sourceJournalEntryLineId);
        EnsureNonEmpty(financialAccountId);
        EnsureValidAmounts(debit, credit);
        EnsureValidSequence(sequence);
        var normalizedDescription = NormalizeDescription(description);

        return new LedgerPostingLine(
            id,
            sourceJournalEntryLineId,
            financialAccountId,
            debit,
            credit,
            normalizedDescription,
            sequence);
    }

    internal static LedgerPostingLine CreateFromSource(JournalEntryLine source) =>
        Create(
            LedgerPostingLineId.New(),
            source.Id,
            source.FinancialAccountId,
            source.Debit,
            source.Credit,
            source.Description,
            source.Sequence);

    public static void EnsureValidAmounts(decimal debit, decimal credit)
    {
        if (debit < 0m)
        {
            throw new ArgumentException("Debit must not be negative.", nameof(debit));
        }

        if (credit < 0m)
        {
            throw new ArgumentException("Credit must not be negative.", nameof(credit));
        }

        if (debit == 0m && credit == 0m)
        {
            throw new ArgumentException("Either debit or credit must be greater than zero.");
        }

        if (debit > 0m && credit > 0m)
        {
            throw new ArgumentException("Debit and credit cannot both be greater than zero.");
        }
    }

    public static void EnsureValidSequence(int sequence)
    {
        if (sequence < 1)
        {
            throw new ArgumentException("Sequence must be greater than or equal to 1.", nameof(sequence));
        }
    }

    private static void EnsureNonEmpty(LedgerPostingLineId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Ledger posting line id must not be empty.", nameof(id));
        }
    }

    private static void EnsureNonEmpty(JournalEntryLineId sourceJournalEntryLineId)
    {
        if (sourceJournalEntryLineId.Value == Guid.Empty)
        {
            throw new ArgumentException(
                "Source journal entry line id must not be empty.",
                nameof(sourceJournalEntryLineId));
        }
    }

    private static void EnsureNonEmpty(AccountId financialAccountId)
    {
        if (financialAccountId.Value == Guid.Empty)
        {
            throw new ArgumentException(
                "Financial account id must not be empty.",
                nameof(financialAccountId));
        }
    }

    private static string? NormalizeDescription(string? description)
    {
        if (description is null)
        {
            return null;
        }

        var normalized = description.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        if (normalized.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Ledger posting line description must not exceed {DescriptionMaxLength} characters.",
                nameof(description));
        }

        return normalized;
    }
}
