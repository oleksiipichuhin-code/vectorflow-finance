using VectorFlow.Finance.Application.Invoices;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Invoices;

internal sealed class InMemoryInvoiceRepository : IInvoiceRepository
{
    private readonly Dictionary<Guid, Invoice> _byId = new();

    public int GetByIdCallCount { get; private set; }

    public int AddCallCount { get; private set; }

    public int SaveChangesCallCount { get; private set; }

    public Task<Invoice?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceId id,
        CancellationToken cancellationToken = default)
    {
        GetByIdCallCount++;

        if (_byId.TryGetValue(id.Value, out var invoice)
            && invoice.FinanceWorkspaceId == financeWorkspaceId)
        {
            return Task.FromResult<Invoice?>(invoice);
        }

        return Task.FromResult<Invoice?>(null);
    }

    public Task AddAsync(Invoice invoice, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        _byId[invoice.Id.Value] = invoice;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveChangesCallCount++;
        return Task.CompletedTask;
    }

    public Invoice? FindById(Guid id) =>
        _byId.TryGetValue(id, out var invoice) ? invoice : null;
}
