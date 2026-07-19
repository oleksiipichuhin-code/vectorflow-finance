namespace VectorFlow.Finance.Domain.Ledger;

/// <summary>
/// Strongly typed identifier for a line within a ledger posting aggregate.
/// </summary>
public readonly record struct LedgerPostingLineId
{
    public Guid Value { get; }

    public LedgerPostingLineId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Ledger posting line id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static LedgerPostingLineId New() => new(Guid.NewGuid());

    public static LedgerPostingLineId From(Guid value) => new(value);

    public override string ToString() => Value.ToString();
}
