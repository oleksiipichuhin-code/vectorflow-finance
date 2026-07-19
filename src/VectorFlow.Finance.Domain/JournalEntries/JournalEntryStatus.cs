namespace VectorFlow.Finance.Domain.JournalEntries;

/// <summary>
/// Lifecycle state of a journal entry.
/// </summary>
/// <remarks>
/// <para><see cref="Draft"/> — lines and name may change; balance is not required.</para>
/// <para><see cref="Posted"/> — immutable; corrections require reversal or correction entries (later).</para>
/// </remarks>
public enum JournalEntryStatus
{
    Draft = 1,
    Posted = 2
}
