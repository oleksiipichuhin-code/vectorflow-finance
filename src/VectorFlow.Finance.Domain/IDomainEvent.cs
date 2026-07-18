namespace VectorFlow.Finance.Domain;

/// <summary>
/// Dependency-free marker for heterogeneous in-process domain events stored by aggregates.
/// Event-specific payload (including timing) lives on concrete event types.
/// </summary>
public interface IDomainEvent;
