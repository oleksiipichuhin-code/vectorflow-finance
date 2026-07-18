namespace VectorFlow.Finance.Domain;

/// <summary>
/// ISO-style currency identifier aligned with <see cref="Money"/> normalization rules.
/// Floating-point types are never used for financial amounts; currency is textual.
/// </summary>
public readonly record struct Currency : IEquatable<Currency>
{
    public string Code { get; }

    public Currency(string code)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new ArgumentException("Currency must not be null, empty, or whitespace.", nameof(code));
        }

        Code = code.Trim().ToUpperInvariant();
    }

    public bool Equals(Currency other) =>
        string.Equals(Code, other.Code, StringComparison.Ordinal);

    public override int GetHashCode() => StringComparer.Ordinal.GetHashCode(Code);

    public override string ToString() => Code;
}
