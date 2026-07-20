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
