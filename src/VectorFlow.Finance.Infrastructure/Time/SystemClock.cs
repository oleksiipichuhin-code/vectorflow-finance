using VectorFlow.Finance.Application.Abstractions;

namespace VectorFlow.Finance.Infrastructure.Time;

/// <summary>
/// System clock for application handlers. Domain continues to receive explicit timestamps.
/// </summary>
public sealed class SystemClock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}
