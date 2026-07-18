using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Workspaces;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class FinanceWorkspaceRepository : IFinanceWorkspaceRepository
{
    private readonly FinanceDbContext _dbContext;

    public FinanceWorkspaceRepository(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<FinanceWorkspace?> GetByIdAsync(
        FinanceWorkspaceId id,
        CancellationToken cancellationToken = default) =>
        _dbContext.FinanceWorkspaces
            .SingleOrDefaultAsync(workspace => workspace.Id == id, cancellationToken);

    public Task<FinanceWorkspace?> GetByPlatformScopeAsync(
        PlatformOrganizationId platformOrganizationId,
        PlatformWorkspaceId platformWorkspaceId,
        CancellationToken cancellationToken = default) =>
        _dbContext.FinanceWorkspaces
            .SingleOrDefaultAsync(
                workspace =>
                    workspace.PlatformOrganizationId == platformOrganizationId &&
                    workspace.PlatformWorkspaceId == platformWorkspaceId,
                cancellationToken);

    public async Task AddAsync(
        FinanceWorkspace workspace,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.FinanceWorkspaces.AddAsync(workspace, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _dbContext.SaveChangesAsync(cancellationToken);
}
