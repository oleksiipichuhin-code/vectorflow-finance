namespace VectorFlow.Finance.Application.Accruals.Commands;

public sealed record CreateAccrualCommand(
    Guid FinanceWorkspaceId,
    string Type,
    decimal Amount,
    string Currency,
    DateTimeOffset RecognitionDateUtc,
    string Description,
    Guid? SourceInvoiceId);

public sealed record ChangeAccrualTypeCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Type);

public sealed record ChangeAccrualAmountCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    decimal Amount);

public sealed record ChangeAccrualCurrencyCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Currency);

public sealed record ChangeAccrualRecognitionDateCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    DateTimeOffset RecognitionDateUtc);

public sealed record ChangeAccrualDescriptionCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Description);

public sealed record ChangeAccrualSourceInvoiceCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    Guid? SourceInvoiceId);

public sealed record RecognizeAccrualCommand(
    Guid FinanceWorkspaceId,
    Guid Id);

public sealed record ReverseAccrualCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Reason);
