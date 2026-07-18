using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Accounts;

/// <summary>
/// Workspace-scoped chart-of-accounts account aggregate.
/// Posting, balances, hierarchy, and uniqueness across accounts are deferred.
/// </summary>
public sealed class Account
{
    public const int NameMaxLength = 200;

    private readonly List<IDomainEvent> _domainEvents = [];

    private Account(
        AccountId id,
        FinanceWorkspaceId financeWorkspaceId,
        AccountCode code,
        string name,
        AccountType type,
        AccountStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt,
        DateTimeOffset? archivedAt)
    {
        Id = id;
        FinanceWorkspaceId = financeWorkspaceId;
        Code = code;
        Name = name;
        Type = type;
        Status = status;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
        ArchivedAt = archivedAt;
    }

    public AccountId Id { get; }

    public FinanceWorkspaceId FinanceWorkspaceId { get; }

    public AccountCode Code { get; private set; }

    public string Name { get; private set; }

    public AccountType Type { get; private set; }

    public AccountStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public DateTimeOffset? ArchivedAt { get; private set; }

    /// <summary>
    /// Read-only view of raised events. The backing store is not exposed for mutation.
    /// </summary>
    public IReadOnlyList<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    public static Account Create(
        AccountId id,
        FinanceWorkspaceId financeWorkspaceId,
        AccountCode code,
        string name,
        AccountType type,
        DateTimeOffset createdAt)
    {
        EnsureNonEmpty(id);
        EnsureNonEmpty(financeWorkspaceId);
        EnsureDefined(type);

        var normalizedName = NormalizeName(name);
        var account = new Account(
            id,
            financeWorkspaceId,
            code,
            normalizedName,
            type,
            AccountStatus.Active,
            createdAt,
            createdAt,
            archivedAt: null);

        account.Raise(new AccountCreated(
            id,
            financeWorkspaceId,
            code.Value,
            normalizedName,
            type,
            createdAt));

        return account;
    }

    public static Account Create(
        AccountId id,
        FinanceWorkspaceId financeWorkspaceId,
        string code,
        string name,
        AccountType type,
        DateTimeOffset createdAt) =>
        Create(id, financeWorkspaceId, new AccountCode(code), name, type, createdAt);

    public void Rename(string name, DateTimeOffset occurredAt)
    {
        EnsureActive("rename");
        var normalizedName = NormalizeName(name);

        if (string.Equals(Name, normalizedName, StringComparison.Ordinal))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Name = normalizedName;
        UpdatedAt = occurredAt;
        Raise(new AccountRenamed(Id, Name, occurredAt));
    }

    public void ChangeCode(AccountCode code, DateTimeOffset occurredAt)
    {
        EnsureActive("change code");

        if (Code.Equals(code))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Code = code;
        UpdatedAt = occurredAt;
        Raise(new AccountCodeChanged(Id, Code.Value, occurredAt));
    }

    public void ChangeCode(string code, DateTimeOffset occurredAt) =>
        ChangeCode(new AccountCode(code), occurredAt);

    public void ChangeType(AccountType type, DateTimeOffset occurredAt)
    {
        EnsureActive("change type");
        EnsureDefined(type);

        if (Type == type)
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Type = type;
        UpdatedAt = occurredAt;
        Raise(new AccountTypeChanged(Id, Type, occurredAt));
    }

    public void Archive(DateTimeOffset occurredAt)
    {
        if (Status == AccountStatus.Archived)
        {
            throw new InvalidOperationException("Account is already archived.");
        }

        if (Status != AccountStatus.Active)
        {
            throw new InvalidOperationException("Only an active account can be archived.");
        }

        EnsureMonotonicTimestamp(occurredAt);
        Status = AccountStatus.Archived;
        ArchivedAt = occurredAt;
        UpdatedAt = occurredAt;
        Raise(new AccountArchived(Id, occurredAt));
    }

    /// <summary>
    /// Clears raised events after a successful unit-of-work observation.
    /// Does not accept external event injection.
    /// </summary>
    public void ClearDomainEvents() => _domainEvents.Clear();

    private void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    private void EnsureActive(string action)
    {
        if (Status == AccountStatus.Archived)
        {
            throw new InvalidOperationException($"An archived account cannot {action}.");
        }

        if (Status != AccountStatus.Active)
        {
            throw new InvalidOperationException($"Only an active account can {action}.");
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

    private static void EnsureNonEmpty(AccountId id)
    {
        if (id.Value == Guid.Empty)
        {
            throw new ArgumentException("Account id must not be empty.", nameof(id));
        }
    }

    private static void EnsureNonEmpty(FinanceWorkspaceId financeWorkspaceId)
    {
        if (financeWorkspaceId.Value == Guid.Empty)
        {
            throw new ArgumentException("Finance workspace id must not be empty.", nameof(financeWorkspaceId));
        }
    }

    private static void EnsureDefined(AccountType type)
    {
        if (!Enum.IsDefined(type))
        {
            throw new ArgumentException($"Account type '{type}' is not defined.", nameof(type));
        }
    }

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Account name must not be blank.", nameof(name));
        }

        var normalized = name.Trim();
        if (normalized.Length > NameMaxLength)
        {
            throw new ArgumentException(
                $"Account name must not exceed {NameMaxLength} characters.",
                nameof(name));
        }

        return normalized;
    }
}
