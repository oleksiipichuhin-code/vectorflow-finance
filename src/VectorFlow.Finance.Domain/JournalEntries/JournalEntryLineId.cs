namespace VectorFlow.Finance.Domain.JournalEntries;

/// <summary>
/// Strongly typed identifier for a line within a journal entry aggregate.
/// </summary>
public readonly record struct JournalEntryLineId
{
    public Guid Value { get; }

    public JournalEntryLineId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Journal entry line id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static JournalEntryLineId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
