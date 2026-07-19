namespace VectorFlow.Finance.Domain.Invoices;

/// <summary>
/// Lifecycle state of an invoice.
/// </summary>
/// <remarks>
/// <para><see cref="Draft"/> — document number, counterparty, currency, due date, and lines may change.</para>
/// <para><see cref="Issued"/> — immutable; payments and corrections are later slices.</para>
/// </remarks>
public enum InvoiceStatus
{
    Draft = 1,
    Issued = 2
}
