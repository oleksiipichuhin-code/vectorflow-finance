using VectorFlow.Finance.Domain.Invoices;

namespace VectorFlow.Finance.Application.Invoices;

internal static class InvoiceMapper
{
    public static InvoiceDto ToDto(Invoice invoice) =>
        new(
            invoice.Id.Value,
            invoice.FinanceWorkspaceId.Value,
            invoice.DocumentNumber,
            invoice.CounterpartyReference.Value,
            invoice.Currency.Code,
            invoice.Status.ToString(),
            invoice.DueDate,
            invoice.TotalAmount,
            invoice.CreatedAt,
            invoice.UpdatedAt,
            invoice.IssuedAt,
            invoice.Lines
                .OrderBy(line => line.Sequence)
                .Select(ToLineDto)
                .ToArray());

    private static InvoiceLineDto ToLineDto(InvoiceLine line) =>
        new(
            line.Id.Value,
            line.Sequence,
            line.Description,
            line.Quantity,
            line.UnitPrice,
            line.LineAmount);
}
