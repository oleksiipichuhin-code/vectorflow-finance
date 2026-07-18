namespace VectorFlow.Finance.Domain.Workspaces;

/// <summary>
/// Lifecycle state of a Finance workspace.
/// </summary>
/// <remarks>
/// <para><see cref="Active"/> — normal financial activity is allowed in future slices.</para>
/// <para><see cref="Suspended"/> — workspace remains readable, but future financial mutations will be blocked.</para>
/// <para><see cref="Archived"/> — historical workspace retained for audit; cannot return to operational use
/// without an explicit future owner-approved policy.</para>
/// </remarks>
public enum FinanceWorkspaceStatus
{
    Active = 1,
    Suspended = 2,
    Archived = 3
}
