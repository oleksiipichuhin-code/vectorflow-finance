using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Invoices;

/// <summary>
/// Workspace-scoped commercial invoice aggregate.
/// Draft invoices may change document metadata and lines; issued invoices are immutable.
/// Ledger posting, payments, and counterparty snapshots are deferred.
/// </summary>
public sealed class Invoice
{
    public const int DocumentNumberMaxLength = 64;

    private readonly List<IDomainEvent> _domainEvents = [];
    private readonly List<InvoiceLine> _lines = [];

    private Invoice(
        InvoiceId id,
        FinanceWorkspaceId financeWorkspaceId,
        string documentNumber,
        CounterpartyReference counterpartyReference,
        Currency currency,
        InvoiceStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        DateTimeOffset? issuedAt,
        DateTimeOffset? dueDate)
    {
        Id = id;
        FinanceWorkspaceId = financeWorkspaceId;
        DocumentNumber = documentNumber;
        CounterpartyReference = counterpartyReference;
        Currency = currency;
        Status = status;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        IssuedAt = issuedAt;
        DueDate = dueDate;
    }

    public InvoiceId Id { get; }

    public FinanceWorkspaceId FinanceWorkspaceId { get; }

    public string DocumentNumber { get; private set; }

    public CounterpartyReference CounterpartyReference { get; private set; }

    public Currency Currency { get; private set; }

    public InvoiceStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public DateTimeOffset? IssuedAt { get; private set; }

    public DateTimeOffset? DueDate { get; private set; }

    public IReadOnlyList<InvoiceLine> Lines => _lines.AsReadOnly();

    public decimal TotalAmount => _lines.Sum(line => line.LineAmount);

    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    public static Invoice Create(
        InvoiceId id,
        FinanceWorkspaceId financeWorkspaceId,
        string documentNumber,
        CounterpartyReference counterpartyReference,
        Currency currency,
        DateTimeOffset createdAt)
    {
        EnsureNonEmpty(id);
        EnsureNonEmpty(financeWorkspaceId);

        var normalizedDocumentNumber = NormalizeDocumentNumber(documentNumber);
        var invoice = new Invoice(
            id,
            financeWorkspaceId,
            normalizedDocumentNumber,
            counterpartyReference,
            currency,
            InvoiceStatus.Draft,
            createdAt,
            createdAt,
            issuedAt: null,
            dueDate: null);

        invoice.Raise(new InvoiceCreated(
            id,
            financeWorkspaceId,
            normalizedDocumentNumber,
            createdAt));

        return invoice;
    }

    public void ChangeDocumentNumber(string documentNumber, DateTimeOffset occurredAt)
    {
        EnsureDraft("change document number");
        var normalized = NormalizeDocumentNumber(documentNumber);

        if (string.Equals(DocumentNumber, normalized, StringComparison.Ordinal))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        DocumentNumber = normalized;
        UpdatedAt = occurredAt;
    }

    public void ChangeCounterpartyReference(
        CounterpartyReference counterpartyReference,
        DateTimeOffset occurredAt)
    {
        EnsureDraft("change counterparty reference");

        if (CounterpartyReference.Equals(counterpartyReference))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        CounterpartyReference = counterpartyReference;
        UpdatedAt = occurredAt;
    }

    public void ChangeCurrency(Currency currency, DateTimeOffset occurredAt)
    {
        EnsureDraft("change currency");

        if (Currency.Equals(currency))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Currency = currency;
        UpdatedAt = occurredAt;
    }

    public void SetDueDate(DateTimeOffset dueDate, DateTimeOffset occurredAt)
    {
        EnsureDraft("set due date");

        if (DueDate is { } current && current == dueDate)
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        DueDate = dueDate;
        UpdatedAt = occurredAt;
    }

    public InvoiceLine AddLine(
        decimal quantity,
        decimal unitPrice,
        string? description,
        DateTimeOffset occurredAt)
    {
        EnsureDraft("add a line");
        InvoiceLine.EnsureValidAmounts(quantity, unitPrice);
        var normalizedDescription = InvoiceLine.NormalizeDescription(description);
        EnsureMonotonicTimestamp(occurredAt);

        var lineId = InvoiceLineId.New();
        EnsureUniqueLineId(lineId);

        var sequence = _lines.Count == 0 ? 1 : _lines.Max(line => line.Sequence) + 1;
        var line = new InvoiceLine(lineId, sequence, quantity, unitPrice, normalizedDescription);

        _lines.Add(line);
        UpdatedAt = occurredAt;
        return line;
    }

    public void UpdateLine(
        InvoiceLineId lineId,
        decimal quantity,
        decimal unitPrice,
        string? description,
        DateTimeOffset occurredAt)
    {
        EnsureDraft("update a line");
        InvoiceLine.EnsureValidAmounts(quantity, unitPrice);
        var normalizedDescription = InvoiceLine.NormalizeDescription(description);
        EnsureMonotonicTimestamp(occurredAt);

        var line = FindLine(lineId);
        line.Replace(quantity, unitPrice, normalizedDescription);
        UpdatedAt = occurredAt;
    }

    public void RemoveLine(InvoiceLineId lineId, DateTimeOffset occurredAt)
    {
        EnsureDraft("remove a line");
        EnsureMonotonicTimestamp(occurredAt);

        var removed = _lines.RemoveAll(line => line.Id.Equals(lineId));
        if (removed == 0)
        {
            throw new InvalidOperationException($"Invoice line '{lineId}' was not found.");
        }

        UpdatedAt = occurredAt;
    }

    public void Issue(DateTimeOffset occurredAt)
    {
        EnsureDraft("issue");

        if (_lines.Count == 0)
        {
            throw new InvalidOperationException("Cannot issue an invoice with no lines.");
        }

        if (TotalAmount <= 0m)
        {
            throw new InvalidOperationException("Cannot issue an invoice with a non-positive total amount.");
        }

        if (DueDate is null)
        {
            throw new InvalidOperationException("Cannot issue an invoice without a due date.");
        }

        if (ToUtcCalendarDate(DueDate.Value) < ToUtcCalendarDate(occurredAt))
        {
            throw new InvalidOperationException(
                "Due date must not be earlier than the issue date.");
        }

        EnsureMonotonicTimestamp(occurredAt);
        Status = InvoiceStatus.Issued;
        IssuedAt = occurredAt;
        UpdatedAt = occurredAt;
        Raise(new InvoiceIssued(Id, FinanceWorkspaceId, occurredAt));
    }

    public void ClearDomainEvents() => _domainEvents.Clear();

    private InvoiceLine FindLine(InvoiceLineId lineId)
    {
        var line = _lines.FirstOrDefault(candidate => candidate.Id.Equals(lineId));
        if (line is null)
        {
            throw new InvalidOperationException($"Invoice line '{lineId}' was not found.");
        }

        return line;
    }

    private void EnsureUniqueLineId(InvoiceLineId lineId)
    {
        if (_lines.Any(line => line.Id.Equals(lineId)))
        {
            throw new InvalidOperationException(
                $"Invoice already contains line '{lineId}'.");
        }
    }

    private void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    private void EnsureDraft(string action)
    {
        if (Status == InvoiceStatus.Issued)
        {
            throw new InvalidOperationException($"An issued invoice cannot {action}.");
        }

        if (Status != InvoiceStatus.Draft)
        {
            throw new InvalidOperationException($"Only a draft invoice can {action}.");
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

    private static DateTime ToUtcCalendarDate(DateTimeOffset value) =>
        value.UtcDateTime.Date;

    private static void EnsureNonEmpty(InvoiceId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Invoice id must not be empty.", nameof(id));
        }
    }

    private static void EnsureNonEmpty(FinanceWorkspaceId financeWorkspaceId)
    {
        if (financeWorkspaceId.Value == Guid.Empty)
        {
            throw new ArgumentException("Finance workspace id must not be empty.", nameof(financeWorkspaceId));
        }
    }

    private static string NormalizeDocumentNumber(string documentNumber)
    {
        if (string.IsNullOrWhiteSpace(documentNumber))
        {
            throw new ArgumentException("Invoice document number must not be blank.", nameof(documentNumber));
        }

        var normalized = documentNumber.Trim();
        if (normalized.Length > DocumentNumberMaxLength)
        {
            throw new ArgumentException(
                $"Invoice document number must not exceed {DocumentNumberMaxLength} characters.",
                nameof(documentNumber));
        }

        return normalized;
    }
}
