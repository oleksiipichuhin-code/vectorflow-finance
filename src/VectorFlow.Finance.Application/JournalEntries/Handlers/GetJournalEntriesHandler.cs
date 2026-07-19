using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries.Queries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

public sealed class GetJournalEntriesHandler
{
    private readonly IJournalEntryRepository _repository;

    public GetJournalEntriesHandler(IJournalEntryRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<IReadOnlyList<JournalEntryDto>>> HandleAsync(
        GetJournalEntriesQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<IReadOnlyList<JournalEntryDto>>.ValidationFailed(ex.Message);
        }

        var entries = await _repository.ListByWorkspaceAsync(financeWorkspaceId, cancellationToken);
        var dtos = entries.Select(JournalEntryMapper.ToDto).ToArray();
        return ApplicationResult<IReadOnlyList<JournalEntryDto>>.Success(dtos);
    }
}
