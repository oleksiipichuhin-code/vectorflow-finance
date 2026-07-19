using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.JournalEntries.Commands;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.JournalEntries.Handlers;

public sealed class CreateJournalEntryHandler
{
    private readonly IJournalEntryRepository _journalEntryRepository;
    private readonly IFinanceWorkspaceRepository _workspaceRepository;
    private readonly IClock _clock;

    public CreateJournalEntryHandler(
        IJournalEntryRepository journalEntryRepository,
        IFinanceWorkspaceRepository workspaceRepository,
        IClock clock)
    {
        _journalEntryRepository = journalEntryRepository;
        _workspaceRepository = workspaceRepository;
        _clock = clock;
    }

    public async Task<ApplicationResult<JournalEntryDto>> HandleAsync(
        CreateJournalEntryCommand command,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(command.FinanceWorkspaceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<JournalEntryDto>.ValidationFailed(ex.Message);
        }

        var workspace = await _workspaceRepository.GetByIdAsync(financeWorkspaceId, cancellationToken);
        if (workspace is null)
        {
            return ApplicationResult<JournalEntryDto>.NotFound("Finance workspace was not found.");
        }

        JournalEntry entry;
        try
        {
            entry = JournalEntry.Create(
                JournalEntryId.New(),
                financeWorkspaceId,
                command.Name,
                _clock.UtcNow);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<JournalEntryDto>.ValidationFailed(ex.Message);
        }

        await _journalEntryRepository.AddAsync(entry, cancellationToken);
        await _journalEntryRepository.SaveChangesAsync(cancellationToken);

        return ApplicationResult<JournalEntryDto>.Success(JournalEntryMapper.ToDto(entry));
    }
}
