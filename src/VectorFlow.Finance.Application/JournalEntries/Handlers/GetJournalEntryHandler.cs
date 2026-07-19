using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries.Queries;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

public sealed class GetJournalEntryHandler
{
    private readonly IJournalEntryRepository _repository;

    public GetJournalEntryHandler(IJournalEntryRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<JournalEntryDto>> HandleAsync(
        GetJournalEntryQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        JournalEntryId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            id = new JournalEntryId(query.Id);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<JournalEntryDto>.ValidationFailed(ex.Message);
        }

        var entry = await _repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (entry is null)
        {
            return ApplicationResult<JournalEntryDto>.NotFound("Journal entry was not found.");
        }

        return ApplicationResult<JournalEntryDto>.Success(JournalEntryMapper.ToDto(entry));
    }
}
