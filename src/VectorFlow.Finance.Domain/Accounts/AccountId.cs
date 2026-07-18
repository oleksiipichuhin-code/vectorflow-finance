namespace VectorFlow.Finance.Domain.Accounts;

/// <summary>
/// Strongly typed identifier for a workspace-scoped chart-of-accounts account.
/// </summary>
public readonly record struct AccountId
{
    public Guid Value { get; }

    public AccountId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Account id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static AccountId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
