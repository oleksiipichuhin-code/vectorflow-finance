namespace VectorFlow.Finance.Domain.Invoices;

/// <summary>
/// Single commercial line within an <see cref="Invoice"/>.
/// Currency lives on the invoice; line amounts are decimal in that currency.
/// </summary>
public sealed class InvoiceLine
{
    public const int DescriptionMaxLength = 500;

    internal InvoiceLine(
        InvoiceLineId id,
        int sequence,
        decimal quantity,
        decimal unitPrice,
        string? description)
    {
        EnsureNonEmpty(id);
        EnsureValidSequence(sequence);
        EnsureValidAmounts(quantity, unitPrice);

        Id = id;
        Sequence = sequence;
        Quantity = quantity;
        UnitPrice = unitPrice;
        LineAmount = quantity * unitPrice;
        Description = NormalizeDescription(description);
    }

    public InvoiceLineId Id { get; }

    public int Sequence { get; private set; }

    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public decimal LineAmount { get; private set; }

    public string? Description { get; private set; }

    internal void Replace(decimal quantity, decimal unitPrice, string? description)
    {
        EnsureValidAmounts(quantity, unitPrice);
        Quantity = quantity;
        UnitPrice = unitPrice;
        LineAmount = quantity * unitPrice;
        Description = NormalizeDescription(description);
    }

    internal static void EnsureValidAmounts(decimal quantity, decimal unitPrice)
    {
        if (quantity <= 0m)
        {
            throw new ArgumentException("Quantity must be greater than zero.", nameof(quantity));
        }

        if (unitPrice < 0m)
        {
            throw new ArgumentException("Unit price must not be negative.", nameof(unitPrice));
        }

        var lineAmount = quantity * unitPrice;
        if (lineAmount <= 0m)
        {
            throw new ArgumentException("Line amount must be greater than zero.");
        }
    }

    internal static void EnsureValidSequence(int sequence)
    {
        if (sequence < 1)
        {
            throw new ArgumentException("Sequence must be greater than or equal to 1.", nameof(sequence));
        }
    }

    internal static void EnsureNonEmpty(InvoiceLineId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Invoice line id must not be empty.", nameof(id));
        }
    }

    internal static string? NormalizeDescription(string? description)
    {
        if (description is null)
        {
            return null;
        }

        var normalized = description.Trim();
        if (normalized.Length == 0)
        {
            return null;
        }

        if (normalized.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Invoice line description must not exceed {DescriptionMaxLength} characters.",
                nameof(description));
        }

        return normalized;
    }
}
