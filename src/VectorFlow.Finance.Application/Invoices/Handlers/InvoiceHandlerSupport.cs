using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

internal static class InvoiceHandlerSupport
{
    public static async Task<ApplicationResult<Invoice>> LoadAsync(
        IInvoiceRepository repository,
        Guid financeWorkspaceIdValue,
        Guid idValue,
        CancellationToken cancellationToken)
    {
        FinanceWorkspaceId financeWorkspaceId;
        InvoiceId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(financeWorkspaceIdValue);
            id = new InvoiceId(idValue);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<Invoice>.ValidationFailed(ex.Message);
        }

        var invoice = await repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (invoice is null)
        {
            // Missing invoice and workspace mismatch both map to NotFound.
            return ApplicationResult<Invoice>.NotFound("Invoice was not found.");
        }

        return ApplicationResult<Invoice>.Success(invoice);
    }

    public static ApplicationResult<InvoiceDto> FromArgumentException(ArgumentException ex) =>
        ApplicationResult<InvoiceDto>.ValidationFailed(ex.Message);

    public static ApplicationResult<InvoiceDto> FromInvalidOperationException(InvalidOperationException ex) =>
        ApplicationResult<InvoiceDto>.Conflict(ex.Message);
}
