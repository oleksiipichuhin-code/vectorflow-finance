using VectorFlow.Finance.Domain.Accounts;

namespace VectorFlow.Finance.Domain.JournalEntries;

/// <summary>
/// Single debit or credit line within a <see cref="JournalEntry"/>.
/// Exactly one of <see cref="Debit"/> or <see cref="Credit"/> must be greater than zero.
/// </summary>
public sealed class JournalEntryLine
{
    public const int DescriptionMaxLength = 500;

    internal JournalEntryLine(
        JournalEntryLineId id,
        AccountId financialAccountId,
        decimal debit,
        decimal credit,
        string? description,
        int sequence)
    {
        Id = id;
        FinancialAccountId = financialAccountId;
        Debit = debit;
        Credit = credit;
        Description = description;
        Sequence = sequence;
    }

    public JournalEntryLineId Id { get; }

    /// <summary>
    /// Chart-of-accounts account referenced by this line (<see cref="AccountId"/>).
    /// </summary>
    public AccountId FinancialAccountId { get; private set; }

    public decimal Debit { get; private set; }

    public decimal Credit { get; private set; }

    public string? Description { get; private set; }

    public int Sequence { get; private set; }

    internal void Replace(
        AccountId financialAccountId,
        decimal debit,
        decimal credit,
        string? description)
    {
        FinancialAccountId = financialAccountId;
        Debit = debit;
        Credit = credit;
        Description = description;
    }

    internal static void EnsureValidAmounts(decimal debit, decimal credit)
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

    internal static string? NormalizeDescription(string? description)
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
                $"Journal entry line description must not exceed {DescriptionMaxLength} characters.",
                nameof(description));
        }

        return normalized;
    }

    internal static void EnsureNonEmpty(AccountId financialAccountId)
    {
        if (financialAccountId.Value == Guid.Empty)
        {
            throw new ArgumentException(
                "Financial account id must not be empty.",
                nameof(financialAccountId));
        }
    }
}
