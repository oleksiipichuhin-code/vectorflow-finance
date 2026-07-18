namespace VectorFlow.Finance.Domain;

/// <summary>
/// Stable external reference to a platform workspace.
/// Used for cross-product correlation within an organization context.
/// </summary>
public readonly record struct PlatformWorkspaceId
{
    public Guid Value { get; }

    public PlatformWorkspaceId(Guid value)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("Platform workspace id must not be empty.", nameof(value));
        }

        Value = value;
    }

    public static PlatformWorkspaceId New() => new(Guid.NewGuid());

    public override string ToString() => Value.ToString();
}
