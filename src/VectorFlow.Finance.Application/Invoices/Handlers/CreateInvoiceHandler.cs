using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Commands;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class CreateInvoiceHandler
{
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IFinanceWorkspaceRepository _workspaceRepository;
    private readonly IClock _clock;

    public CreateInvoiceHandler(
        IInvoiceRepository invoiceRepository,
        IFinanceWorkspaceRepository workspaceRepository,
        IClock clock)
    {
        _invoiceRepository = invoiceRepository;
        _workspaceRepository = workspaceRepository;
        _clock = clock;
    }

    public async Task<ApplicationResult<InvoiceDto>> HandleAsync(
        CreateInvoiceCommand command,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        CounterpartyReference counterpartyReference;
        Currency currency;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(command.FinanceWorkspaceId);
            counterpartyReference = new CounterpartyReference(command.CounterpartyReference);
            currency = new Currency(command.Currency);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<InvoiceDto>.ValidationFailed(ex.Message);
        }

        var workspace = await _workspaceRepository.GetByIdAsync(financeWorkspaceId, cancellationToken);
        if (workspace is null)
        {
            return ApplicationResult<InvoiceDto>.NotFound("Finance workspace was not found.");
        }

        Invoice invoice;
        try
        {
            invoice = Invoice.Create(
                InvoiceId.New(),
                financeWorkspaceId,
                command.DocumentNumber,
                counterpartyReference,
                currency,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<InvoiceDto>.ValidationFailed(ex.Message);
        }

        await _invoiceRepository.AddAsync(invoice, cancellationToken);
        await _invoiceRepository.SaveChangesAsync(cancellationToken);

        return ApplicationResult<InvoiceDto>.Success(InvoiceMapper.ToDto(invoice));
    }
}
