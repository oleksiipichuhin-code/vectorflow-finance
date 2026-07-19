namespace VectorFlow.Finance.Application.GeneralLedger.Queries;

public sealed record GetAccountStatementQuery(
    Guid FinanceWorkspaceId,
    Guid AccountId,
    DateTimeOffset? PeriodFromUtc,
    DateTimeOffset? PeriodToUtc);
