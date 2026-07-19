namespace VectorFlow.Finance.Domain.Ledger;

/// <summary>
/// Strongly typed identifier for an immutable ledger posting aggregate.
/// </summary>
public readonly record struct LedgerPostingId
{
    public Guid Value { get; }

    public LedgerPostingId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Ledger posting id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static LedgerPostingId New() => new(Guid.NewGuid());

    public static LedgerPostingId From(Guid value) => new(value);

    public override string ToString() => Value.ToString();
}
