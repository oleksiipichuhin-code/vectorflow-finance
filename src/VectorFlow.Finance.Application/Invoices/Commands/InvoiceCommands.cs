namespace VectorFlow.Finance.Application.Invoices.Commands;

public sealed record CreateInvoiceCommand(
    Guid FinanceWorkspaceId,
    string DocumentNumber,
    string CounterpartyReference,
    string Currency);

public sealed record ChangeInvoiceDocumentNumberCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string DocumentNumber);

public sealed record ChangeInvoiceCounterpartyCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string CounterpartyReference);

public sealed record ChangeInvoiceCurrencyCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Currency);

public sealed record SetInvoiceDueDateCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    DateTimeOffset DueDateUtc);

public sealed record AddInvoiceLineCommand(
    Guid FinanceWorkspaceId,
    Guid InvoiceId,
    decimal Quantity,
    decimal UnitPrice,
    string? Description);

public sealed record UpdateInvoiceLineCommand(
    Guid FinanceWorkspaceId,
    Guid InvoiceId,
    Guid LineId,
    decimal Quantity,
    decimal UnitPrice,
    string? Description);

public sealed record RemoveInvoiceLineCommand(
    Guid FinanceWorkspaceId,
    Guid InvoiceId,
    Guid LineId);

public sealed record IssueInvoiceCommand(
    Guid FinanceWorkspaceId,
    Guid Id);
