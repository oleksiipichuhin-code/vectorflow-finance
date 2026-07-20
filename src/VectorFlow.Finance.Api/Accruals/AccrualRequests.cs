namespace VectorFlow.Finance.Api.Accruals;

public sealed record CreateAccrualRequest(
    string Type,
    decimal Amount,
    string Currency,
    DateTimeOffset RecognitionDateUtc,
    string Description,
    Guid? SourceInvoiceId);

public sealed record ChangeAccrualTypeRequest(string Type);

public sealed record ChangeAccrualAmountRequest(decimal Amount);

public sealed record ChangeAccrualCurrencyRequest(string Currency);

public sealed record ChangeAccrualRecognitionDateRequest(DateTimeOffset RecognitionDateUtc);

public sealed record ChangeAccrualDescriptionRequest(string Description);

public sealed record ChangeAccrualSourceInvoiceRequest(Guid? SourceInvoiceId);

public sealed record ReverseAccrualRequest(string Reason);
