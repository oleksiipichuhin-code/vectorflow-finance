namespace VectorFlow.Finance.Application.Invoices;

public sealed record InvoiceLineDto(
    Guid Id,
    int Sequence,
    string? Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineAmount);

public sealed record InvoiceDto(
    Guid Id,
    Guid FinanceWorkspaceId,
    string DocumentNumber,
    string CounterpartyReference,
    string Currency,
    string Status,
    DateTimeOffset? DueDateUtc,
    decimal TotalAmount,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? IssuedAtUtc,
    IReadOnlyList<InvoiceLineDto> Lines);
