using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Accruals;

/// <summary>
/// Workspace-scoped revenue or expense recognition aggregate.
/// Draft accruals may change financial and source fields; recognized accruals may reverse;
/// reversed accruals are immutable. Ledger posting and compensating accruals are deferred.
/// </summary>
public sealed class Accrual
{
    public const int DescriptionMaxLength = 500;

    public const int ReversalReasonMaxLength = 500;

    private readonly List<IDomainEvent> _domainEvents = [];

    private Accrual(
        AccrualId id,
        FinanceWorkspaceId financeWorkspaceId,
        AccrualType type,
        decimal amount,
        Currency currency,
        DateTimeOffset recognitionDate,
        string description,
        InvoiceId? sourceInvoiceId,
        AccrualStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        DateTimeOffset? recognizedAt,
        DateTimeOffset? reversedAt,
        string? reversalReason)
    {
        Id = id;
        FinanceWorkspaceId = financeWorkspaceId;
        Type = type;
        Amount = amount;
        Currency = currency;
        RecognitionDate = recognitionDate;
        Description = description;
        SourceInvoiceId = sourceInvoiceId;
        Status = status;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        RecognizedAt = recognizedAt;
        ReversedAt = reversedAt;
        ReversalReason = reversalReason;
    }

    public AccrualId Id { get; }

    public FinanceWorkspaceId FinanceWorkspaceId { get; }

    public AccrualType Type { get; private set; }

    public decimal Amount { get; private set; }

    public Currency Currency { get; private set; }

    public DateTimeOffset RecognitionDate { get; private set; }

    public string Description { get; private set; }

    public InvoiceId? SourceInvoiceId { get; private set; }

    public AccrualStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public DateTimeOffset? RecognizedAt { get; private set; }

    public DateTimeOffset? ReversedAt { get; private set; }

    public string? ReversalReason { get; private set; }

    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    public static Accrual Create(
        AccrualId id,
        FinanceWorkspaceId financeWorkspaceId,
        AccrualType type,
        decimal amount,
        Currency currency,
        DateTimeOffset recognitionDate,
        string description,
        InvoiceId? sourceInvoiceId,
        DateTimeOffset createdAt)
    {
        EnsureNonEmpty(id);
        EnsureNonEmpty(financeWorkspaceId);
        EnsureDefined(type);
        EnsurePositiveAmount(amount);
        var normalizedDescription = NormalizeDescription(description);

        var accrual = new Accrual(
            id,
            financeWorkspaceId,
            type,
            amount,
            currency,
            recognitionDate,
            normalizedDescription,
            sourceInvoiceId,
            AccrualStatus.Draft,
            createdAt,
            createdAt,
            recognizedAt: null,
            reversedAt: null,
            reversalReason: null);

        accrual.Raise(new AccrualCreated(
            id,
            financeWorkspaceId,
            type,
            amount,
            currency.Code,
            recognitionDate,
            createdAt));

        return accrual;
    }

    public void ChangeType(AccrualType type, DateTimeOffset occurredAt)
    {
        EnsureDraft("change type");
        EnsureDefined(type);

        if (Type == type)
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Type = type;
        UpdatedAt = occurredAt;
    }

    public void ChangeAmount(decimal amount, DateTimeOffset occurredAt)
    {
        EnsureDraft("change amount");
        EnsurePositiveAmount(amount);

        if (Amount == amount)
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Amount = amount;
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

    public void ChangeRecognitionDate(DateTimeOffset recognitionDate, DateTimeOffset occurredAt)
    {
        EnsureDraft("change recognition date");

        if (RecognitionDate == recognitionDate)
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        RecognitionDate = recognitionDate;
        UpdatedAt = occurredAt;
    }

    public void ChangeDescription(string description, DateTimeOffset occurredAt)
    {
        EnsureDraft("change description");
        var normalized = NormalizeDescription(description);

        if (string.Equals(Description, normalized, StringComparison.Ordinal))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Description = normalized;
        UpdatedAt = occurredAt;
    }

    public void ChangeSourceInvoice(InvoiceId? sourceInvoiceId, DateTimeOffset occurredAt)
    {
        EnsureDraft("change source invoice");

        if (NullableEquals(SourceInvoiceId, sourceInvoiceId))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        SourceInvoiceId = sourceInvoiceId;
        UpdatedAt = occurredAt;
    }

    public void Recognize(DateTimeOffset recognizedAt)
    {
        EnsureDraft("recognize");
        EnsureMonotonicTimestamp(recognizedAt);

        Status = AccrualStatus.Recognized;
        RecognizedAt = recognizedAt;
        UpdatedAt = recognizedAt;
        Raise(new AccrualRecognized(Id, FinanceWorkspaceId, recognizedAt));
    }

    public void Reverse(string reason, DateTimeOffset reversedAt)
    {
        if (Status == AccrualStatus.Draft)
        {
            throw new InvalidOperationException("A draft accrual cannot reverse.");
        }

        if (Status == AccrualStatus.Reversed)
        {
            throw new InvalidOperationException("Accrual is already reversed.");
        }

        if (Status != AccrualStatus.Recognized)
        {
            throw new InvalidOperationException("Only a recognized accrual can reverse.");
        }

        var normalizedReason = NormalizeReversalReason(reason);
        EnsureMonotonicTimestamp(reversedAt);

        Status = AccrualStatus.Reversed;
        ReversedAt = reversedAt;
        ReversalReason = normalizedReason;
        UpdatedAt = reversedAt;
        Raise(new AccrualReversed(Id, FinanceWorkspaceId, normalizedReason, reversedAt));
    }

    public void ClearDomainEvents() => _domainEvents.Clear();

    private void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    private void EnsureDraft(string action)
    {
        if (Status == AccrualStatus.Recognized)
        {
            throw new InvalidOperationException($"A recognized accrual cannot {action}.");
        }

        if (Status == AccrualStatus.Reversed)
        {
            throw new InvalidOperationException($"A reversed accrual cannot {action}.");
        }

        if (Status != AccrualStatus.Draft)
        {
            throw new InvalidOperationException($"Only a draft accrual can {action}.");
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

    private static bool NullableEquals(InvoiceId? left, InvoiceId? right)
    {
        if (left is null && right is null)
        {
            return true;
        }

        if (left is null || right is null)
        {
            return false;
        }

        return left.Value.Equals(right.Value);
    }

    private static void EnsureNonEmpty(AccrualId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Accrual id must not be empty.", nameof(id));
        }
    }

    private static void EnsureNonEmpty(FinanceWorkspaceId financeWorkspaceId)
    {
        if (financeWorkspaceId.Value == Guid.Empty)
        {
            throw new ArgumentException("Finance workspace id must not be empty.", nameof(financeWorkspaceId));
        }
    }

    private static void EnsureDefined(AccrualType type)
    {
        if (!Enum.IsDefined(type))
        {
            throw new ArgumentException($"Accrual type '{type}' is not defined.", nameof(type));
        }
    }

    private static void EnsurePositiveAmount(decimal amount)
    {
        if (amount <= 0m)
        {
            throw new ArgumentException("Accrual amount must be greater than zero.", nameof(amount));
        }
    }

    private static string NormalizeDescription(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            throw new ArgumentException("Accrual description must not be blank.", nameof(description));
        }

        var normalized = description.Trim();
        if (normalized.Length > DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Accrual description must not exceed {DescriptionMaxLength} characters.",
                nameof(description));
        }

        return normalized;
    }

    private static string NormalizeReversalReason(string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new ArgumentException("Accrual reversal reason must not be blank.", nameof(reason));
        }

        var normalized = reason.Trim();
        if (normalized.Length > ReversalReasonMaxLength)
        {
            throw new ArgumentException(
                $"Accrual reversal reason must not exceed {ReversalReasonMaxLength} characters.",
                nameof(reason));
        }

        return normalized;
    }
}
