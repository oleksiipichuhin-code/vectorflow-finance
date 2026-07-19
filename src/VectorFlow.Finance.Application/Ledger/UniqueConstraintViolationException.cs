namespace VectorFlow.Finance.Application.Ledger;

/// <summary>
/// Raised by Infrastructure when a database unique constraint is violated.
/// Used for idempotent ledger posting races without leaking EF into Application.
/// </summary>
public sealed class UniqueConstraintViolationException : Exception
{
    public UniqueConstraintViolationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
