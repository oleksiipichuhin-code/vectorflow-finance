namespace VectorFlow.Finance.Domain.Accounts;

/// <summary>
/// Chart-of-accounts code within a finance workspace.
/// </summary>
/// <remarks>
/// <para>
/// Values are trimmed but casing is preserved. Equality uses
/// <see cref="StringComparison.OrdinalIgnoreCase"/> so that future persistence can enforce
/// case-insensitive uniqueness per <c>FinanceWorkspace</c> without treating
/// <c>1000</c> and <c>1000 </c> as distinct after normalization.
/// </para>
/// <para>
/// Cross-account uniqueness is a persistence/Application concern and is not enforced here.
/// </para>
/// </remarks>
public readonly record struct AccountCode : IEquatable<AccountCode>
{
    public const int MaxLength = 32;

    public string Value { get; }

    public AccountCode(string value)
    {
        Value = Normalize(value);
    }

    public bool Equals(AccountCode other) =>
        string.Equals(Value, other.Value, StringComparison.OrdinalIgnoreCase);

    public override int GetHashCode() =>
        StringComparer.OrdinalIgnoreCase.GetHashCode(Value);

    public override string ToString() => Value;

    private static string Normalize(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException("Account code must not be blank.", nameof(value));
        }

        var normalized = value.Trim();
        if (normalized.Length > MaxLength)
        {
            throw new ArgumentException(
                $"Account code must not exceed {MaxLength} characters.",
                nameof(value));
        }

        foreach (var ch in normalized)
        {
            if (char.IsControl(ch))
            {
                throw new ArgumentException("Account code must not contain control characters.", nameof(value));
            }

            if (!IsAllowed(ch))
            {
                throw new ArgumentException(
                    "Account code may contain only letters, digits, and the separators '.', '-', '/'.",
                    nameof(value));
            }
        }

        return normalized;
    }

    private static bool IsAllowed(char ch) =>
        char.IsAsciiLetterOrDigit(ch) || ch is '.' or '-' or '/';
}
