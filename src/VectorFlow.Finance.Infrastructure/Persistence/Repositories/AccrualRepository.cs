using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class AccrualRepository : IAccrualRepository
{
    private readonly FinanceDbContext _dbContext;

    public AccrualRepository(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<Accrual?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccrualId id,
        CancellationToken cancellationToken = default) =>
        _dbContext.Accruals
            .SingleOrDefaultAsync(
                accrual =>
                    accrual.FinanceWorkspaceId == financeWorkspaceId &&
                    accrual.Id == id,
                cancellationToken);

    public async Task AddAsync(
        Accrual accrual,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.Accruals.AddAsync(accrual, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _dbContext.SaveChangesAsync(cancellationToken);
}
