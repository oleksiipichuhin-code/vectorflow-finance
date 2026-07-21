using VectorFlow.Finance.Application.Invoices;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Invoices;

internal sealed class InMemoryInvoiceRepository : IInvoiceRepository
{
    private readonly Dictionary<Guid, Invoice> _byId = new();

    public int GetByIdCallCount { get; private set; }

    public int ListByWorkspaceCallCount { get; private set; }

    public int ListByDocumentNumberCallCount { get; private set; }

    public FinanceWorkspaceId? LastListedWorkspaceId { get; private set; }

    public string? LastListedDocumentNumber { get; private set; }

    public CancellationToken? LastListByDocumentNumberCancellationToken { get; private set; }

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

    public Task<IReadOnlyList<Invoice>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        ListByWorkspaceCallCount++;
        LastListedWorkspaceId = financeWorkspaceId;

        IReadOnlyList<Invoice> invoices = _byId.Values
            .Where(invoice => invoice.FinanceWorkspaceId == financeWorkspaceId)
            .OrderByDescending(invoice => invoice.CreatedAt)
            .ThenByDescending(invoice => invoice.Id.Value)
            .ToList();

        return Task.FromResult(invoices);
    }

    public Task<IReadOnlyList<Invoice>> ListByDocumentNumberAsync(
        FinanceWorkspaceId financeWorkspaceId,
        string documentNumber,
        CancellationToken cancellationToken = default)
    {
        ListByDocumentNumberCallCount++;
        LastListedWorkspaceId = financeWorkspaceId;
        LastListedDocumentNumber = documentNumber;
        LastListByDocumentNumberCancellationToken = cancellationToken;

        IReadOnlyList<Invoice> invoices = _byId.Values
            .Where(invoice =>
                invoice.FinanceWorkspaceId == financeWorkspaceId &&
                string.Equals(invoice.DocumentNumber, documentNumber, StringComparison.Ordinal))
            .OrderByDescending(invoice => invoice.CreatedAt)
            .ThenByDescending(invoice => invoice.Id.Value)
            .ToList();

        return Task.FromResult(invoices);
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
