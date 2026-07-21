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
        CancellationToken cancellationToken = default)
    {
        var filtered = _dbContext.Invoices
            .Where(invoice => invoice.FinanceWorkspaceId == financeWorkspaceId);

        var totalCount = await filtered.CountAsync(cancellationToken);

        var invoices = await InvoicesWithLines()
            .Where(invoice => invoice.FinanceWorkspaceId == financeWorkspaceId)
            .ToListAsync(cancellationToken);

        var items = invoices
            .OrderByDescending(invoice => invoice.CreatedAt)
            .ThenByDescending(invoice => invoice.Id.Value)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return (items, totalCount);
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
