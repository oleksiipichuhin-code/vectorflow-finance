namespace VectorFlow.Finance.Domain.Accounts;

/// <summary>
/// Lifecycle state of a chart-of-accounts account.
/// </summary>
/// <remarks>
/// <para><see cref="Active"/> — account may be renamed, re-coded, or retyped.</para>
/// <para><see cref="Archived"/> — retained for audit; mutations are rejected. No restore in F2A.</para>
/// </remarks>
public enum AccountStatus
{
    Active = 1,
    Archived = 2
}
