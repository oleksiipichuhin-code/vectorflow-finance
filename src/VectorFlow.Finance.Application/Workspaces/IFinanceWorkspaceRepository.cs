using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Workspaces;

/// <summary>
/// Persistence port for Finance workspaces. Implementation belongs to Infrastructure (F1C).
/// </summary>
public interface IFinanceWorkspaceRepository
{
    Task<FinanceWorkspace?> GetByIdAsync(
        FinanceWorkspaceId id,
        CancellationToken cancellationToken = default);

    Task<FinanceWorkspace?> GetByPlatformScopeAsync(
        PlatformOrganizationId platformOrganizationId,
        PlatformWorkspaceId platformWorkspaceId,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        FinanceWorkspace workspace,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
