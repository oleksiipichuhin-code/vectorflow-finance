using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Workspaces;

internal sealed class FixedClock : IClock
{
    public FixedClock(DateTimeOffset utcNow)
    {
        UtcNow = utcNow;
    }

    public DateTimeOffset UtcNow { get; set; }
}

internal sealed class InMemoryFinanceWorkspaceRepository : IFinanceWorkspaceRepository
{
    private readonly Dictionary<Guid, FinanceWorkspace> _byId = new();
    private readonly Dictionary<(Guid OrganizationId, Guid PlatformWorkspaceId), Guid> _byScope = new();

    public int SaveChangesCallCount { get; private set; }

    public int AddCallCount { get; private set; }

    public Task<FinanceWorkspace?> GetByIdAsync(
        FinanceWorkspaceId id,
        CancellationToken cancellationToken = default)
    {
        _byId.TryGetValue(id.Value, out var workspace);
        return Task.FromResult(workspace);
    }

    public Task<FinanceWorkspace?> GetByPlatformScopeAsync(
        PlatformOrganizationId platformOrganizationId,
        PlatformWorkspaceId platformWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        if (_byScope.TryGetValue((platformOrganizationId.Value, platformWorkspaceId.Value), out var id))
        {
            return Task.FromResult<FinanceWorkspace?>(_byId[id]);
        }

        return Task.FromResult<FinanceWorkspace?>(null);
    }

    public Task AddAsync(FinanceWorkspace workspace, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        _byId[workspace.Id.Value] = workspace;
        _byScope[(workspace.PlatformOrganizationId.Value, workspace.PlatformWorkspaceId.Value)] = workspace.Id.Value;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveChangesCallCount++;
        return Task.CompletedTask;
    }
}
