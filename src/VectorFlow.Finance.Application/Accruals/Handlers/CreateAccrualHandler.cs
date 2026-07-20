using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Commands;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class CreateAccrualHandler
{
    private readonly IAccrualRepository _accrualRepository;
    private readonly IFinanceWorkspaceRepository _workspaceRepository;
    private readonly IClock _clock;

    public CreateAccrualHandler(
        IAccrualRepository accrualRepository,
        IFinanceWorkspaceRepository workspaceRepository,
        IClock clock)
    {
        _accrualRepository = accrualRepository;
        _workspaceRepository = workspaceRepository;
        _clock = clock;
    }

    public async Task<ApplicationResult<AccrualDto>> HandleAsync(
        CreateAccrualCommand command,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        Currency currency;
        InvoiceId? sourceInvoiceId;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(command.FinanceWorkspaceId);
            currency = new Currency(command.Currency);
            sourceInvoiceId = command.SourceInvoiceId is null
                ? null
                : new InvoiceId(command.SourceInvoiceId.Value);
        }
        catch (ArgumentException ex)
        {
            return AccrualHandlerSupport.FromArgumentException(ex);
        }

        if (!AccrualHandlerSupport.TryParseAccrualType(command.Type, out var type, out var typeError))
        {
            return ApplicationResult<AccrualDto>.ValidationFailed(typeError!);
        }

        var workspace = await _workspaceRepository.GetByIdAsync(financeWorkspaceId, cancellationToken);
        if (workspace is null)
        {
            return ApplicationResult<AccrualDto>.NotFound("Finance workspace was not found.");
        }

        Accrual accrual;
        try
        {
            accrual = Accrual.Create(
                AccrualId.New(),
                financeWorkspaceId,
                type,
                command.Amount,
                currency,
                command.RecognitionDateUtc,
                command.Description,
                sourceInvoiceId,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return AccrualHandlerSupport.FromArgumentException(ex);
        }

        await _accrualRepository.AddAsync(accrual, cancellationToken);
        await _accrualRepository.SaveChangesAsync(cancellationToken);

        return ApplicationResult<AccrualDto>.Success(AccrualMapper.ToDto(accrual));
    }
}
