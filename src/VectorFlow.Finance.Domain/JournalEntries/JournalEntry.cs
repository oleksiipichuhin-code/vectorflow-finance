using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.JournalEntries;

/// <summary>
/// Workspace-scoped double-entry journal entry aggregate.
/// Draft entries may be unbalanced; posted entries are immutable and must balance.
/// </summary>
public sealed class JournalEntry
{
    public const int NameMaxLength = 200;

    private readonly List<IDomainEvent> _domainEvents = [];
    private readonly List<JournalEntryLine> _lines = [];

    private JournalEntry(
        JournalEntryId id,
        FinanceWorkspaceId financeWorkspaceId,
        string name,
        JournalEntryStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        DateTimeOffset? postedAt)
    {
        Id = id;
        FinanceWorkspaceId = financeWorkspaceId;
        Name = name;
        Status = status;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        PostedAt = postedAt;
    }

    public JournalEntryId Id { get; }

    public FinanceWorkspaceId FinanceWorkspaceId { get; }

    public string Name { get; private set; }

    public JournalEntryStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public DateTimeOffset? PostedAt { get; private set; }

    public IReadOnlyList<JournalEntryLine> Lines => _lines.AsReadOnly();

    public decimal TotalDebit => _lines.Sum(line => line.Debit);

    public decimal TotalCredit => _lines.Sum(line => line.Credit);

    /// <summary>
    /// True when Σ Debit equals Σ Credit. An empty draft is treated as balanced (0 == 0)
    /// but <see cref="Post"/> still requires at least one line with a positive total.
    /// </summary>
    public bool IsBalanced => TotalDebit == TotalCredit;

    /// <summary>
    /// Read-only view of raised events. The backing store is not exposed for mutation.
    /// </summary>
    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    public static JournalEntry Create(
        JournalEntryId id,
        FinanceWorkspaceId financeWorkspaceId,
        string name,
        DateTimeOffset createdAt)
    {
        EnsureNonEmpty(id);
        EnsureNonEmpty(financeWorkspaceId);

        var normalizedName = NormalizeName(name);
        var entry = new JournalEntry(
            id,
            financeWorkspaceId,
            normalizedName,
            JournalEntryStatus.Draft,
            createdAt,
            createdAt,
            postedAt: null);

        entry.Raise(new JournalEntryCreated(
            id,
            financeWorkspaceId,
            normalizedName,
            createdAt));

        return entry;
    }

    public void Rename(string name, DateTimeOffset occurredAt)
    {
        EnsureDraft("rename");
        var normalizedName = NormalizeName(name);

        if (string.Equals(Name, normalizedName, StringComparison.Ordinal))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Name = normalizedName;
        UpdatedAt = occurredAt;
    }

    public JournalEntryLine AddLine(
        AccountId financialAccountId,
        decimal debit,
        decimal credit,
        string? description,
        DateTimeOffset occurredAt)
    {
        EnsureDraft("add a line");
        JournalEntryLine.EnsureNonEmpty(financialAccountId);
        JournalEntryLine.EnsureValidAmounts(debit, credit);
        var normalizedDescription = JournalEntryLine.NormalizeDescription(description);
        EnsureMonotonicTimestamp(occurredAt);

        var sequence = _lines.Count == 0 ? 1 : _lines.Max(line => line.Sequence) + 1;
        var line = new JournalEntryLine(
            JournalEntryLineId.New(),
            financialAccountId,
            debit,
            credit,
            normalizedDescription,
            sequence);

        _lines.Add(line);
        UpdatedAt = occurredAt;
        return line;
    }

    public void UpdateLine(
        JournalEntryLineId lineId,
        AccountId financialAccountId,
        decimal debit,
        decimal credit,
        string? description,
        DateTimeOffset occurredAt)
    {
        EnsureDraft("update a line");
        JournalEntryLine.EnsureNonEmpty(financialAccountId);
        JournalEntryLine.EnsureValidAmounts(debit, credit);
        var normalizedDescription = JournalEntryLine.NormalizeDescription(description);
        EnsureMonotonicTimestamp(occurredAt);

        var line = FindLine(lineId);
        line.Replace(financialAccountId, debit, credit, normalizedDescription);
        UpdatedAt = occurredAt;
    }

    public void RemoveLine(JournalEntryLineId lineId, DateTimeOffset occurredAt)
    {
        EnsureDraft("remove a line");
        EnsureMonotonicTimestamp(occurredAt);

        var removed = _lines.RemoveAll(line => line.Id.Equals(lineId));
        if (removed == 0)
        {
            throw new InvalidOperationException($"Journal entry line '{lineId}' was not found.");
        }

        UpdatedAt = occurredAt;
    }

    public void Post(DateTimeOffset occurredAt)
    {
        EnsureDraft("post");

        if (_lines.Count == 0)
        {
            throw new InvalidOperationException("Cannot post a journal entry with no lines.");
        }

        if (!IsBalanced)
        {
            throw new InvalidOperationException(
                $"Cannot post an unbalanced journal entry. Total debit {TotalDebit} does not equal total credit {TotalCredit}.");
        }

        EnsureMonotonicTimestamp(occurredAt);
        Status = JournalEntryStatus.Posted;
        PostedAt = occurredAt;
        UpdatedAt = occurredAt;
        Raise(new JournalEntryPosted(Id, FinanceWorkspaceId, occurredAt));
    }

    /// <summary>
    /// Clears raised events after a successful unit-of-work observation.
    /// Does not accept external event injection.
    /// </summary>
    public void ClearDomainEvents() => _domainEvents.Clear();

    private JournalEntryLine FindLine(JournalEntryLineId lineId)
    {
        var line = _lines.FirstOrDefault(candidate => candidate.Id.Equals(lineId));
        if (line is null)
        {
            throw new InvalidOperationException($"Journal entry line '{lineId}' was not found.");
        }

        return line;
    }

    private void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    private void EnsureDraft(string action)
    {
        if (Status == JournalEntryStatus.Posted)
        {
            throw new InvalidOperationException($"A posted journal entry cannot {action}.");
        }

        if (Status != JournalEntryStatus.Draft)
        {
            throw new InvalidOperationException($"Only a draft journal entry can {action}.");
        }
    }

    private void EnsureMonotonicTimestamp(DateTimeOffset occurredAt)
    {
        if (occurredAt < CreatedAt)
        {
            throw new ArgumentException(
                "Occurred-at timestamp cannot be earlier than CreatedAt.",
                nameof(occurredAt));
        }

        if (occurredAt < UpdatedAt)
        {
            throw new ArgumentException(
                "Occurred-at timestamp cannot be earlier than UpdatedAt.",
                nameof(occurredAt));
        }
    }

    private static void EnsureNonEmpty(JournalEntryId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Journal entry id must not be empty.", nameof(id));
        }
    }

    private static void EnsureNonEmpty(FinanceWorkspaceId financeWorkspaceId)
    {
        if (financeWorkspaceId.Value == Guid.Empty)
        {
            throw new ArgumentException("Finance workspace id must not be empty.", nameof(financeWorkspaceId));
        }
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Journal entry name must not be blank.", nameof(name));
        }

        var normalized = name.Trim();
        if (normalized.Length > NameMaxLength)
        {
            throw new ArgumentException(
                $"Journal entry name must not exceed {NameMaxLength} characters.",
                nameof(name));
        }

        return normalized;
    }
}
