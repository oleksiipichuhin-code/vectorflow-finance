namespace VectorFlow.Finance.Domain.Invoices;

/// <summary>
/// Strongly typed identifier for a workspace-scoped invoice aggregate.
/// </summary>
public readonly record struct InvoiceId
{
    public Guid Value { get; }

    public InvoiceId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Invoice id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static InvoiceId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
