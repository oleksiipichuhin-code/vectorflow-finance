namespace VectorFlow.Finance.Domain.Accruals;

/// <summary>
/// Lifecycle state of an accrual.
/// </summary>
/// <remarks>
/// <para><see cref="Draft"/> — type, money, recognition date, description, and optional source invoice may change.</para>
/// <para><see cref="Recognized"/> — financial and source fields immutable; may reverse.</para>
/// <para><see cref="Reversed"/> — terminal; immutable.</para>
/// </remarks>
public enum AccrualStatus
{
    Draft = 1,
    Recognized = 2,
    Reversed = 3
}
