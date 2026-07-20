namespace VectorFlow.Finance.Api.Invoices;

public sealed record CreateInvoiceRequest(
    string DocumentNumber,
    string CounterpartyReference,
    string Currency);

public sealed record ChangeInvoiceDocumentNumberRequest(string DocumentNumber);

public sealed record ChangeInvoiceCounterpartyRequest(string CounterpartyReference);

public sealed record ChangeInvoiceCurrencyRequest(string Currency);

public sealed record SetInvoiceDueDateRequest(DateTimeOffset DueDateUtc);

public sealed record AddInvoiceLineRequest(
    decimal Quantity,
    decimal UnitPrice,
    string? Description);

public sealed record UpdateInvoiceLineRequest(
    decimal Quantity,
    decimal UnitPrice,
    string? Description);
