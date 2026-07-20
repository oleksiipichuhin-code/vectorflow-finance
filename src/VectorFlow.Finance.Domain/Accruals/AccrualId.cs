namespace VectorFlow.Finance.Domain.Accruals;

/// <summary>
/// Strongly typed identifier for a workspace-scoped accrual aggregate.
/// </summary>
public readonly record struct AccrualId
{
    public Guid Value { get; }

    public AccrualId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Accrual id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static AccrualId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
