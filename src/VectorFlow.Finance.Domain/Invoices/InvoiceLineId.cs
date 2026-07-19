namespace VectorFlow.Finance.Domain.Invoices;

/// <summary>
/// Strongly typed identifier for a line within an <see cref="Invoice"/>.
/// </summary>
public readonly record struct InvoiceLineId
{
    public Guid Value { get; }

    public InvoiceLineId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Invoice line id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static InvoiceLineId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
