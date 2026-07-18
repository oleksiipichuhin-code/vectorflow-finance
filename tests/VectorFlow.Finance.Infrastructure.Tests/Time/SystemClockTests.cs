using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Infrastructure.Time;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Time;

public sealed class SystemClockTests
{
    [Fact]
    public void SystemClock_returns_utc_now()
    {
        IClock clock = new SystemClock();
        var before = DateTimeOffset.UtcNow.AddSeconds(-2);
        var value = clock.UtcNow;
        var after = DateTimeOffset.UtcNow.AddSeconds(2);

        Assert.True(value >= before);
        Assert.True(value <= after);
        Assert.Equal(TimeSpan.Zero, value.Offset);
    }
}
