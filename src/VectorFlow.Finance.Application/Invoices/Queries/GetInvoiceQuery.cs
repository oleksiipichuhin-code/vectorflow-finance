namespace VectorFlow.Finance.Application.Invoices.Queries;

public sealed record GetInvoiceByIdQuery(
    Guid FinanceWorkspaceId,
    Guid Id);

public sealed record GetInvoicesQuery(
    Guid FinanceWorkspaceId);

public sealed record GetInvoicesByDocumentNumberQuery(
    Guid FinanceWorkspaceId,
    string? DocumentNumber);

public sealed record GetInvoicesPagedQuery(
    Guid FinanceWorkspaceId,
    int Page,
    int PageSize,
    string? Status = null,
    DateTimeOffset? CreatedFromUtc = null,
    DateTimeOffset? CreatedToUtc = null,
    string? DocumentNumber = null,
    string? CounterpartyReference = null);
