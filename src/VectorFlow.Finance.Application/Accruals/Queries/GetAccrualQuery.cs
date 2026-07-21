namespace VectorFlow.Finance.Application.Accruals.Queries;

public sealed record GetAccrualByIdQuery(
    Guid FinanceWorkspaceId,
    Guid Id);

public sealed record GetAccrualsQuery(
    Guid FinanceWorkspaceId);

public sealed record GetAccrualsPagedQuery(
    Guid FinanceWorkspaceId,
    int Page,
    int PageSize);

public sealed record GetAccrualsByInvoiceQuery(
    Guid FinanceWorkspaceId,
    Guid InvoiceId);
