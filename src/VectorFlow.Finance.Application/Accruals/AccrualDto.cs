namespace VectorFlow.Finance.Application.Accruals;

public sealed record AccrualDto(
    Guid Id,
    Guid FinanceWorkspaceId,
    string Type,
    decimal Amount,
    string Currency,
    DateTimeOffset RecognitionDateUtc,
    string Description,
    Guid? SourceInvoiceId,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? RecognizedAtUtc,
    DateTimeOffset? ReversedAtUtc,
    string? ReversalReason);
