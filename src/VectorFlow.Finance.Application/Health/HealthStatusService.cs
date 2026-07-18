using VectorFlow.Finance.Contracts.Health;

namespace VectorFlow.Finance.Application.Health;

/// <summary>
/// Application-level health status for the F0 foundation runtime.
/// </summary>
public sealed class HealthStatusService
{
    public const string ProductName = "VectorFlow Finance API";
    public const string HealthyStatus = "Healthy";
    public const string FoundationPhase = "F0";

    public HealthStatusResponse GetStatus() =>
        new(ProductName, HealthyStatus, FoundationPhase);
}
