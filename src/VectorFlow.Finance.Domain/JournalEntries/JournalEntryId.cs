namespace VectorFlow.Finance.Domain.JournalEntries;

/// <summary>
/// Strongly typed identifier for a workspace-scoped journal entry aggregate.
/// </summary>
public readonly record struct JournalEntryId
{
    public Guid Value { get; }

    public JournalEntryId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Journal entry id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static JournalEntryId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
