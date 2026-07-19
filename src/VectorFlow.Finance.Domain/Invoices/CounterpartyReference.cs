namespace VectorFlow.Finance.Domain.Invoices;

/// <summary>
/// Opaque external counterparty identifier preserved on finance documents.
/// Not a CRM master record and not a full counterparty snapshot.
/// </summary>
public readonly record struct CounterpartyReference : IEquatable<CounterpartyReference>
{
    public const int MaxLength = 128;

    public string Value { get; }

    public CounterpartyReference(string value)
    {
        Value = Normalize(value);
    }

    public bool Equals(CounterpartyReference other) =>
        string.Equals(Value, other.Value, StringComparison.Ordinal);

    public override int GetHashCode() => StringComparer.Ordinal.GetHashCode(Value);

    public override string ToString() => Value;

    private static string Normalize(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Counterparty reference must not be blank.", nameof(value));
        }

        var normalized = value.Trim();
        if (normalized.Length > MaxLength)
        {
            throw new ArgumentException(
                $"Counterparty reference must not exceed {MaxLength} characters.",
                nameof(value));
        }

        return normalized;
    }
}
