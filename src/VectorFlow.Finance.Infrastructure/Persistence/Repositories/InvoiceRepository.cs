using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Invoices;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class InvoiceRepository : IInvoiceRepository
{
    private readonly FinanceDbContext _dbContext;

    public InvoiceRepository(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<Invoice?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceId id,
        CancellationToken cancellationToken = default) =>
        InvoicesWithLines()
            .SingleOrDefaultAsync(
                invoice =>
                    invoice.FinanceWorkspaceId == financeWorkspaceId &&
                    invoice.Id == id,
                cancellationToken);

    public async Task<IReadOnlyList<Invoice>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        var invoices = await InvoicesWithLines()
            .Where(invoice => invoice.FinanceWorkspaceId == financeWorkspaceId)
            .ToListAsync(cancellationToken);

        return invoices
            .OrderByDescending(invoice => invoice.CreatedAt)
            .ThenByDescending(invoice => invoice.Id.Value)
            .ToList();
    }

    public async Task<IReadOnlyList<Invoice>> ListByDocumentNumberAsync(
        FinanceWorkspaceId financeWorkspaceId,
        string documentNumber,
        CancellationToken cancellationToken = default)
    {
        var invoices = await InvoicesWithLines()
            .Where(invoice =>
                invoice.FinanceWorkspaceId == financeWorkspaceId &&
                invoice.DocumentNumber == documentNumber)
            .ToListAsync(cancellationToken);

        return invoices
            .OrderByDescending(invoice => invoice.CreatedAt)
            .ThenByDescending(invoice => invoice.Id.Value)
            .ToList();
    }

    public async Task<(IReadOnlyList<Invoice> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        InvoiceStatus? status = null,
        DateTimeOffset? createdFromUtc = null,
        DateTimeOffset? createdToUtc = null,
        CancellationToken cancellationToken = default)
    {
        // SQLite cannot translate DateTimeOffset comparisons; CreatedAt bounds are applied in memory.
        var invoices = await ApplySqlPagedFilters(
                InvoicesWithLines(),
                financeWorkspaceId,
                status)
            .ToListAsync(cancellationToken);

        IEnumerable<Invoice> filtered = invoices;

        if (createdFromUtc is not null)
        {
            filtered = filtered.Where(invoice => invoice.CreatedAt >= createdFromUtc.Value);
        }

        if (createdToUtc is not null)
        {
            filtered = filtered.Where(invoice => invoice.CreatedAt <= createdToUtc.Value);
        }

        var matched = filtered
            .OrderByDescending(invoice => invoice.CreatedAt)
            .ThenByDescending(invoice => invoice.Id.Value)
            .ToList();

        var totalCount = matched.Count;
        var items = matched
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return (items, totalCount);
    }

    private static IQueryable<Invoice> ApplySqlPagedFilters(
        IQueryable<Invoice> source,
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceStatus? status)
    {
        var filtered = source.Where(invoice => invoice.FinanceWorkspaceId == financeWorkspaceId);

        if (status is not null)
        {
            filtered = filtered.Where(invoice => invoice.Status == status.Value);
        }

        return filtered;
    }

    public async Task AddAsync(
        Invoice invoice,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.Invoices.AddAsync(invoice, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _dbContext.SaveChangesAsync(cancellationToken);

    private IQueryable<Invoice> InvoicesWithLines() =>
        _dbContext.Invoices
            .Include(invoice => invoice.Lines);
}
