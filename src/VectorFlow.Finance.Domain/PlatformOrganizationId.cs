namespace VectorFlow.Finance.Domain;

/// <summary>
/// Stable external reference to a platform organization.
/// Used for cross-product correlation; not a CRM master key.
/// </summary>
public readonly record struct PlatformOrganizationId
{
    public Guid Value { get; }

    public PlatformOrganizationId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Platform organization id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static PlatformOrganizationId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
