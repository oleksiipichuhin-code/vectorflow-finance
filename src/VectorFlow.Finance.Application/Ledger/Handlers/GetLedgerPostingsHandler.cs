using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Ledger.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Ledger.Handlers;

public sealed class GetLedgerPostingsHandler
{
    private readonly ILedgerPostingRepository _repository;

    public GetLedgerPostingsHandler(ILedgerPostingRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<LedgerPostingDto>>> HandleAsync(
        GetLedgerPostingsQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<LedgerPostingDto>>.ValidationFailed(ex.Message);
        }

        var postings = await _repository.ListByWorkspaceAsync(financeWorkspaceId, cancellationToken);
        var dtos = postings.Select(LedgerPostingMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<LedgerPostingDto>>.Success(dtos);
    }
}
