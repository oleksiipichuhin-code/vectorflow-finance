namespace VectorFlow.Finance.Contracts.Health;

/// <summary>
/// Public health payload for the Finance API composition root.
/// Must not expose secrets, connection strings, or infrastructure topology.
/// </summary>
public sealed record HealthStatusResponse(
    string Product,
    string Status,
    string Phase);
