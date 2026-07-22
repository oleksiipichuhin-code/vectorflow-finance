using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
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

    public async Task<IReadOnlyList<Accrual>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        var accruals = await _dbContext.Accruals
            .Where(accrual => accrual.FinanceWorkspaceId == financeWorkspaceId)
            .ToListAsync(cancellationToken);

        return accruals
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();
    }

    public async Task<(IReadOnlyList<Accrual> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        AccrualStatus? status = null,
        DateTimeOffset? createdFromUtc = null,
        DateTimeOffset? createdToUtc = null,
        InvoiceId? sourceInvoiceId = null,
        CancellationToken cancellationToken = default)
    {
        // SQLite cannot translate DateTimeOffset comparisons; CreatedAt bounds are applied in memory.
        var accruals = await ApplySqlPagedFilters(
                _dbContext.Accruals,
                financeWorkspaceId,
                status,
                sourceInvoiceId)
            .ToListAsync(cancellationToken);

        IEnumerable<Accrual> filtered = accruals;

        if (createdFromUtc is not null)
        {
            filtered = filtered.Where(accrual => accrual.CreatedAt >= createdFromUtc.Value);
        }

        if (createdToUtc is not null)
        {
            filtered = filtered.Where(accrual => accrual.CreatedAt <= createdToUtc.Value);
        }

        var matched = filtered
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();

        var totalCount = matched.Count;
        var items = matched
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return (items, totalCount);
    }

    private static IQueryable<Accrual> ApplySqlPagedFilters(
        IQueryable<Accrual> source,
        FinanceWorkspaceId financeWorkspaceId,
        AccrualStatus? status,
        InvoiceId? sourceInvoiceId)
    {
        var filtered = source.Where(accrual => accrual.FinanceWorkspaceId == financeWorkspaceId);

        if (status is not null)
        {
            filtered = filtered.Where(accrual => accrual.Status == status.Value);
        }

        if (sourceInvoiceId is not null)
        {
            filtered = filtered.Where(accrual => accrual.SourceInvoiceId == sourceInvoiceId.Value);
        }

        return filtered;
    }

    public async Task<IReadOnlyList<Accrual>> ListBySourceInvoiceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceId sourceInvoiceId,
        CancellationToken cancellationToken = default)
    {
        var accruals = await _dbContext.Accruals
            .Where(accrual =>
                accrual.FinanceWorkspaceId == financeWorkspaceId &&
                accrual.SourceInvoiceId == sourceInvoiceId)
            .ToListAsync(cancellationToken);

        return accruals
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();
    }

    public async Task AddAsync(
        Accrual accrual,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.Accruals.AddAsync(accrual, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _dbContext.SaveChangesAsync(cancellationToken);
}
