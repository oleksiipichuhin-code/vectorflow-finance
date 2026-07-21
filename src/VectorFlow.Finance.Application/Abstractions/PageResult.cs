namespace VectorFlow.Finance.Application.Abstractions;

/// <summary>
/// Minimal paged result envelope for Finance Application/API listing.
/// </summary>
public sealed record PageResult<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount);
