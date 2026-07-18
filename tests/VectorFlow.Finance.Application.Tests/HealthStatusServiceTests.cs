using VectorFlow.Finance.Application.Health;
using Xunit;

namespace VectorFlow.Finance.Application.Tests;

public sealed class HealthStatusServiceTests
{
    [Fact]
    public void GetStatus_returns_f0_foundation_payload()
    {
        var service = new HealthStatusService();
        var status = service.GetStatus();

        Assert.Equal("VectorFlow Finance API", status.Product);
        Assert.Equal("Healthy", status.Status);
        Assert.Equal("F0", status.Phase);
    }
}
