namespace VectorFlow.Finance.Application.Invoices.Queries;

public sealed record GetInvoiceByIdQuery(
    Guid FinanceWorkspaceId,
    Guid Id);
