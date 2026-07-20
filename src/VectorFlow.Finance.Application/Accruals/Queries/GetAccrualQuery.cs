namespace VectorFlow.Finance.Application.Accruals.Queries;

public sealed record GetAccrualByIdQuery(
    Guid FinanceWorkspaceId,
    Guid Id);
