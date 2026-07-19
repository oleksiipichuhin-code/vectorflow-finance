using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Ledger;

/// <summary>
/// Immutable ledger posting created from a posted journal entry.
/// One journal entry maps to at most one posting; global uniqueness is enforced in F3E.
/// </summary>
public sealed class LedgerPosting
{
    private readonly List<IDomainEvent> _domainEvents = [];
    private readonly List<LedgerPostingLine> _lines = [];

    private LedgerPosting(
        LedgerPostingId id,
        FinanceWorkspaceId financeWorkspaceId,
        JournalEntryId journalEntryId,
        DateTimeOffset postedAtUtc)
    {
        Id = id;
        FinanceWorkspaceId = financeWorkspaceId;
        JournalEntryId = journalEntryId;
        PostedAtUtc = postedAtUtc;
    }

    public LedgerPostingId Id { get; }

    public FinanceWorkspaceId FinanceWorkspaceId { get; }

    public JournalEntryId JournalEntryId { get; }

    public DateTimeOffset PostedAtUtc { get; }

    public IReadOnlyList<LedgerPostingLine> Lines => _lines.AsReadOnly();

    public decimal TotalDebit => _lines.Sum(line => line.Debit);

    public decimal TotalCredit => _lines.Sum(line => line.Credit);

    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    public static LedgerPosting CreateFrom(LedgerPostingId id, JournalEntry journalEntry)
    {
        ArgumentNullException.ThrowIfNull(journalEntry);
        EnsureNonEmpty(id);

        if (journalEntry.Status != JournalEntryStatus.Posted)
        {
            throw new InvalidOperationException(
                "Ledger posting can only be created from a posted journal entry.");
        }

        if (journalEntry.PostedAt is null)
        {
            throw new InvalidOperationException(
                "Posted journal entry must have PostedAt set.");
        }

        if (journalEntry.Lines.Count == 0)
        {
            throw new InvalidOperationException(
                "Ledger posting requires a journal entry with at least one line.");
        }

        if (!journalEntry.IsBalanced || journalEntry.TotalDebit <= 0m || journalEntry.TotalCredit <= 0m)
        {
            throw new InvalidOperationException(
                "Ledger posting requires a balanced journal entry with positive totals.");
        }

        if (journalEntry.FinanceWorkspaceId.Value == Guid.Empty)
        {
            throw new ArgumentException("Finance workspace id must not be empty.", nameof(journalEntry));
        }

        if (journalEntry.Id.Value == Guid.Empty)
        {
            throw new ArgumentException("Journal entry id must not be empty.", nameof(journalEntry));
        }

        var posting = new LedgerPosting(
            id,
            journalEntry.FinanceWorkspaceId,
            journalEntry.Id,
            journalEntry.PostedAt.Value);

        var seenSourceLineIds = new HashSet<Guid>();

        foreach (var sourceLine in journalEntry.Lines.OrderBy(line => line.Sequence))
        {
            if (!seenSourceLineIds.Add(sourceLine.Id.Value))
            {
                throw new InvalidOperationException(
                    $"Duplicate source journal entry line id '{sourceLine.Id}' is not allowed.");
            }

            posting._lines.Add(LedgerPostingLine.CreateFromSource(sourceLine));
        }

        if (posting.TotalDebit != posting.TotalCredit)
        {
            throw new InvalidOperationException(
                $"Ledger posting is unbalanced. Total debit {posting.TotalDebit} does not equal total credit {posting.TotalCredit}.");
        }

        if (posting.TotalDebit <= 0m || posting.TotalCredit <= 0m)
        {
            throw new InvalidOperationException(
                "Ledger posting totals must be greater than zero.");
        }

        posting.Raise(new LedgerPostingCreated(
            posting.Id,
            posting.FinanceWorkspaceId,
            posting.JournalEntryId,
            posting.PostedAtUtc));

        return posting;
    }

    public void ClearDomainEvents() => _domainEvents.Clear();

    private void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    private static void EnsureNonEmpty(LedgerPostingId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Ledger posting id must not be empty.", nameof(id));
        }
    }
}
