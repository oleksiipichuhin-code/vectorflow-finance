using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Accruals;

internal sealed class InMemoryAccrualRepository : IAccrualRepository
{
    private readonly Dictionary<Guid, Accrual> _byId = new();

    public int GetByIdCallCount { get; private set; }

    public int ListByWorkspaceCallCount { get; private set; }

    public FinanceWorkspaceId? LastListedWorkspaceId { get; private set; }

    public int AddCallCount { get; private set; }

    public int SaveChangesCallCount { get; private set; }

    public Task<Accrual?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccrualId id,
        CancellationToken cancellationToken = default)
    {
        GetByIdCallCount++;

        if (_byId.TryGetValue(id.Value, out var accrual)
            && accrual.FinanceWorkspaceId == financeWorkspaceId)
        {
            return Task.FromResult<Accrual?>(accrual);
        }

        return Task.FromResult<Accrual?>(null);
    }

    public Task<IReadOnlyList<Accrual>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        ListByWorkspaceCallCount++;
        LastListedWorkspaceId = financeWorkspaceId;

        IReadOnlyList<Accrual> accruals = _byId.Values
            .Where(accrual => accrual.FinanceWorkspaceId == financeWorkspaceId)
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();

        return Task.FromResult(accruals);
    }

    public Task AddAsync(Accrual accrual, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        _byId[accrual.Id.Value] = accrual;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveChangesCallCount++;
        return Task.CompletedTask;
    }

    public Accrual? FindById(Guid id) =>
        _byId.TryGetValue(id, out var accrual) ? accrual : null;
}
