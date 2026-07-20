using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Accruals;

public sealed record AccrualCreated(
    AccrualId AccrualId,
    FinanceWorkspaceId FinanceWorkspaceId,
    AccrualType Type,
    decimal Amount,
    string CurrencyCode,
    DateTimeOffset RecognitionDate,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccrualRecognized(
    AccrualId AccrualId,
    FinanceWorkspaceId FinanceWorkspaceId,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccrualReversed(
    AccrualId AccrualId,
    FinanceWorkspaceId FinanceWorkspaceId,
    string ReversalReason,
    DateTimeOffset OccurredAt) : IDomainEvent;
