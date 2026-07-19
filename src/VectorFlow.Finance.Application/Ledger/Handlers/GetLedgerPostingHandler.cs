using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Ledger.Queries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Ledger.Handlers;

public sealed class GetLedgerPostingHandler
{
    private readonly ILedgerPostingRepository _repository;

    public GetLedgerPostingHandler(ILedgerPostingRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<LedgerPostingDto>> HandleAsync(
        GetLedgerPostingQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        LedgerPostingId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            id = new LedgerPostingId(query.Id);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<LedgerPostingDto>.ValidationFailed(ex.Message);
        }

        var posting = await _repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (posting is null)
        {
            return ApplicationResult<LedgerPostingDto>.NotFound("Ledger posting was not found.");
        }

        return ApplicationResult<LedgerPostingDto>.Success(LedgerPostingMapper.ToDto(posting));
    }
}
