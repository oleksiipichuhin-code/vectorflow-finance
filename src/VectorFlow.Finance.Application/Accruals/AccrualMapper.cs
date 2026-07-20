using VectorFlow.Finance.Domain.Accruals;

namespace VectorFlow.Finance.Application.Accruals;

internal static class AccrualMapper
{
    public static AccrualDto ToDto(Accrual accrual) =>
        new(
            accrual.Id.Value,
            accrual.FinanceWorkspaceId.Value,
            accrual.Type.ToString(),
            accrual.Amount,
            accrual.Currency.Code,
            accrual.RecognitionDate,
            accrual.Description,
            accrual.SourceInvoiceId?.Value,
            accrual.Status.ToString(),
            accrual.CreatedAt,
            accrual.UpdatedAt,
            accrual.RecognizedAt,
            accrual.ReversedAt,
            accrual.ReversalReason);
}
