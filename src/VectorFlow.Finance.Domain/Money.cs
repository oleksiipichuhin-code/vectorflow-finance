namespace VectorFlow.Finance.Domain;

/// <summary>
/// Monetary value expressed as a decimal amount and currency identifier.
/// Floating-point types are prohibited for financial amounts.
/// </summary>
public readonly record struct Money : IEquatable<Money>
{
    public decimal Amount { get; }
    public string Currency { get; }

    public Money(decimal amount, string currency)
    {
        if (string.IsNullOrWhiteSpace(currency))
        {
            throw new ArgumentException("Currency must not be null, empty, or whitespace.", nameof(currency));
        }

        Amount = amount;
        Currency = currency.Trim().ToUpperInvariant();
    }

    public bool Equals(Money other) =>
        Amount == other.Amount &&
        string.Equals(Currency, other.Currency, StringComparison.Ordinal);

    public override int GetHashCode() => HashCode.Combine(Amount, Currency);

    public override string ToString() => $"{Amount} {Currency}";
}
