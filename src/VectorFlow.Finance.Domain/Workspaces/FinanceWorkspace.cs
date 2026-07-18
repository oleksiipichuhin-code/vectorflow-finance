namespace VectorFlow.Finance.Domain.Workspaces;

/// <summary>
/// Finance-owned workspace aggregate. References platform organization and workspace identifiers
/// without duplicating Platform Foundation master data.
/// </summary>
public sealed class FinanceWorkspace
{
    public const int NameMaxLength = 200;

    private FinanceWorkspace(
        FinanceWorkspaceId id,
        PlatformOrganizationId platformOrganizationId,
        PlatformWorkspaceId platformWorkspaceId,
        string name,
        Currency defaultCurrency,
        FinanceWorkspaceStatus status,
        DateTimeOffset createdAt,
        DateTimeOffset updatedAt)
    {
        Id = id;
        PlatformOrganizationId = platformOrganizationId;
        PlatformWorkspaceId = platformWorkspaceId;
        Name = name;
        DefaultCurrency = defaultCurrency;
        Status = status;
        CreatedAt = createdAt;
        UpdatedAt = updatedAt;
    }

    public FinanceWorkspaceId Id { get; }

    public PlatformOrganizationId PlatformOrganizationId { get; }

    public PlatformWorkspaceId PlatformWorkspaceId { get; }

    public string Name { get; private set; }

    public Currency DefaultCurrency { get; private set; }

    public FinanceWorkspaceStatus Status { get; private set; }

    public DateTimeOffset CreatedAt { get; }

    public DateTimeOffset UpdatedAt { get; private set; }

    public static FinanceWorkspace Create(
        FinanceWorkspaceId id,
        PlatformOrganizationId platformOrganizationId,
        PlatformWorkspaceId platformWorkspaceId,
        string name,
        Currency defaultCurrency,
        DateTimeOffset createdAt)
    {
        var normalizedName = NormalizeName(name);

        return new FinanceWorkspace(
            id,
            platformOrganizationId,
            platformWorkspaceId,
            normalizedName,
            defaultCurrency,
            FinanceWorkspaceStatus.Active,
            createdAt,
            createdAt);
    }

    public static FinanceWorkspace Create(
        FinanceWorkspaceId id,
        PlatformOrganizationId platformOrganizationId,
        PlatformWorkspaceId platformWorkspaceId,
        string name,
        string defaultCurrency,
        DateTimeOffset createdAt) =>
        Create(
            id,
            platformOrganizationId,
            platformWorkspaceId,
            name,
            new Currency(defaultCurrency),
            createdAt);

    public void Rename(string name, DateTimeOffset occurredAt)
    {
        EnsureNotArchived("rename");
        var normalizedName = NormalizeName(name);

        if (string.Equals(Name, normalizedName, StringComparison.Ordinal))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        Name = normalizedName;
        UpdatedAt = occurredAt;
    }

    public void ChangeDefaultCurrency(Currency defaultCurrency, DateTimeOffset occurredAt)
    {
        EnsureActive("change default currency");

        if (DefaultCurrency.Equals(defaultCurrency))
        {
            return;
        }

        EnsureMonotonicTimestamp(occurredAt);
        DefaultCurrency = defaultCurrency;
        UpdatedAt = occurredAt;
    }

    public void ChangeDefaultCurrency(string defaultCurrency, DateTimeOffset occurredAt) =>
        ChangeDefaultCurrency(new Currency(defaultCurrency), occurredAt);

    public void Suspend(DateTimeOffset occurredAt)
    {
        if (Status == FinanceWorkspaceStatus.Suspended)
        {
            throw new InvalidOperationException("Finance workspace is already suspended.");
        }

        if (Status != FinanceWorkspaceStatus.Active)
        {
            throw new InvalidOperationException("Only an active finance workspace can be suspended.");
        }

        EnsureMonotonicTimestamp(occurredAt);
        Status = FinanceWorkspaceStatus.Suspended;
        UpdatedAt = occurredAt;
    }

    public void Reactivate(DateTimeOffset occurredAt)
    {
        if (Status == FinanceWorkspaceStatus.Archived)
        {
            throw new InvalidOperationException("An archived finance workspace cannot be reactivated.");
        }

        if (Status != FinanceWorkspaceStatus.Suspended)
        {
            throw new InvalidOperationException("Only a suspended finance workspace can be reactivated.");
        }

        EnsureMonotonicTimestamp(occurredAt);
        Status = FinanceWorkspaceStatus.Active;
        UpdatedAt = occurredAt;
    }

    public void Archive(DateTimeOffset occurredAt)
    {
        if (Status == FinanceWorkspaceStatus.Archived)
        {
            throw new InvalidOperationException("Finance workspace is already archived.");
        }

        if (Status is not (FinanceWorkspaceStatus.Active or FinanceWorkspaceStatus.Suspended))
        {
            throw new InvalidOperationException("Finance workspace cannot be archived from the current status.");
        }

        EnsureMonotonicTimestamp(occurredAt);
        Status = FinanceWorkspaceStatus.Archived;
        UpdatedAt = occurredAt;
    }

    private void EnsureActive(string action)
    {
        if (Status == FinanceWorkspaceStatus.Archived)
        {
            throw new InvalidOperationException($"An archived finance workspace cannot {action}.");
        }

        if (Status != FinanceWorkspaceStatus.Active)
        {
            throw new InvalidOperationException($"Only an active finance workspace can {action}.");
        }
    }

    private void EnsureNotArchived(string action)
    {
        if (Status == FinanceWorkspaceStatus.Archived)
        {
            throw new InvalidOperationException($"An archived finance workspace cannot {action}.");
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

    private static string NormalizeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Finance workspace name must not be blank.", nameof(name));
        }

        var normalized = name.Trim();
        if (normalized.Length > NameMaxLength)
        {
            throw new ArgumentException(
                $"Finance workspace name must not exceed {NameMaxLength} characters.",
                nameof(name));
        }

        return normalized;
    }
}
