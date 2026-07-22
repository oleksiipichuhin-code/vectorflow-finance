using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Tests.Accruals;

internal sealed class InMemoryAccrualRepository : IAccrualRepository
{
    private readonly Dictionary<Guid, Accrual> _byId = new();

    public int GetByIdCallCount { get; private set; }

    public int ListByWorkspaceCallCount { get; private set; }

    public int ListPagedCallCount { get; private set; }

    public int ListBySourceInvoiceCallCount { get; private set; }

    public FinanceWorkspaceId? LastListedWorkspaceId { get; private set; }

    public int? LastListedPage { get; private set; }

    public int? LastListedPageSize { get; private set; }

    public AccrualStatus? LastListedStatus { get; private set; }

    public DateTimeOffset? LastListedCreatedFromUtc { get; private set; }

    public DateTimeOffset? LastListedCreatedToUtc { get; private set; }

    public InvoiceId? LastListedPagedSourceInvoiceId { get; private set; }

    public CancellationToken? LastListPagedCancellationToken { get; private set; }

    public InvoiceId? LastListedSourceInvoiceId { get; private set; }

    public int AddCallCount { get; private set; }

    public int SaveChangesCallCount { get; private set; }

    public Task<Accrual?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccrualId id,
        CancellationToken cancellationToken = default)
    {
        GetByIdCallCount++;

        if (_byId.TryGetValue(id.Value, out var accrual)
            && accrual.FinanceWorkspaceId == financeWorkspaceId)
        {
            return Task.FromResult<Accrual?>(accrual);
        }

        return Task.FromResult<Accrual?>(null);
    }

    public Task<IReadOnlyList<Accrual>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        ListByWorkspaceCallCount++;
        LastListedWorkspaceId = financeWorkspaceId;

        IReadOnlyList<Accrual> accruals = _byId.Values
            .Where(accrual => accrual.FinanceWorkspaceId == financeWorkspaceId)
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();

        return Task.FromResult(accruals);
    }

    public Task<(IReadOnlyList<Accrual> Items, int TotalCount)> ListPagedAsync(
        FinanceWorkspaceId financeWorkspaceId,
        int page,
        int pageSize,
        AccrualStatus? status = null,
        DateTimeOffset? createdFromUtc = null,
        DateTimeOffset? createdToUtc = null,
        InvoiceId? sourceInvoiceId = null,
        CancellationToken cancellationToken = default)
    {
        ListPagedCallCount++;
        LastListedWorkspaceId = financeWorkspaceId;
        LastListedPage = page;
        LastListedPageSize = pageSize;
        LastListedStatus = status;
        LastListedCreatedFromUtc = createdFromUtc;
        LastListedCreatedToUtc = createdToUtc;
        LastListedPagedSourceInvoiceId = sourceInvoiceId;
        LastListPagedCancellationToken = cancellationToken;

        var matched = _byId.Values
            .Where(accrual => accrual.FinanceWorkspaceId == financeWorkspaceId)
            .Where(accrual => status is null || accrual.Status == status.Value)
            .Where(accrual => createdFromUtc is null || accrual.CreatedAt >= createdFromUtc.Value)
            .Where(accrual => createdToUtc is null || accrual.CreatedAt <= createdToUtc.Value)
            .Where(accrual => sourceInvoiceId is null || accrual.SourceInvoiceId == sourceInvoiceId.Value)
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();

        IReadOnlyList<Accrual> items = matched
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return Task.FromResult((items, matched.Count));
    }

    public Task<IReadOnlyList<Accrual>> ListBySourceInvoiceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        InvoiceId sourceInvoiceId,
        CancellationToken cancellationToken = default)
    {
        ListBySourceInvoiceCallCount++;
        LastListedWorkspaceId = financeWorkspaceId;
        LastListedSourceInvoiceId = sourceInvoiceId;

        IReadOnlyList<Accrual> accruals = _byId.Values
            .Where(accrual =>
                accrual.FinanceWorkspaceId == financeWorkspaceId &&
                accrual.SourceInvoiceId == sourceInvoiceId)
            .OrderByDescending(accrual => accrual.CreatedAt)
            .ThenByDescending(accrual => accrual.Id.Value)
            .ToList();

        return Task.FromResult(accruals);
    }

    public Task AddAsync(Accrual accrual, CancellationToken cancellationToken = default)
    {
        AddCallCount++;
        _byId[accrual.Id.Value] = accrual;
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SaveChangesCallCount++;
        return Task.CompletedTask;
    }

    public Accrual? FindById(Guid id) =>
        _byId.TryGetValue(id, out var accrual) ? accrual : null;
}
