namespace VectorFlow.Finance.Application.Abstractions;

/// <summary>
/// Application clock abstraction for deterministic timestamps.
/// </summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}
