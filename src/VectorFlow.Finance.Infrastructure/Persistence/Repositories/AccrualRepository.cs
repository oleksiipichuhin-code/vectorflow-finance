using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Domain;
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
        AccrualType? type = null,
        DateTimeOffset? recognitionFromUtc = null,
        DateTimeOffset? recognitionToUtc = null,
        string? currency = null,
        decimal? amountFrom = null,
        decimal? amountTo = null,
        string? description = null,
        DateTimeOffset? recognizedFromUtc = null,
        DateTimeOffset? recognizedToUtc = null,
        DateTimeOffset? reversedFromUtc = null,
        DateTimeOffset? reversedToUtc = null,
        CancellationToken cancellationToken = default)
    {
        // SQLite cannot translate DateTimeOffset comparisons; CreatedAt, RecognitionDate, Amount,
        // RecognizedAt, and ReversedAt bounds are applied in memory (Amount/RecognizedAt/ReversedAt
        // stay with the existing in-memory filter stage).
        var accruals = await ApplySqlPagedFilters(
                _dbContext.Accruals,
                financeWorkspaceId,
                status,
                sourceInvoiceId,
                type,
                currency,
                description)
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

        if (recognitionFromUtc is not null)
        {
            filtered = filtered.Where(accrual => accrual.RecognitionDate >= recognitionFromUtc.Value);
        }

        if (recognitionToUtc is not null)
        {
            filtered = filtered.Where(accrual => accrual.RecognitionDate <= recognitionToUtc.Value);
        }

        if (amountFrom is not null)
        {
            filtered = filtered.Where(accrual => accrual.Amount >= amountFrom.Value);
        }

        if (amountTo is not null)
        {
            filtered = filtered.Where(accrual => accrual.Amount <= amountTo.Value);
        }

        if (recognizedFromUtc is not null)
        {
            filtered = filtered.Where(accrual =>
                accrual.RecognizedAt is { } recognizedAt && recognizedAt >= recognizedFromUtc.Value);
        }

        if (recognizedToUtc is not null)
        {
            filtered = filtered.Where(accrual =>
                accrual.RecognizedAt is { } recognizedAt && recognizedAt <= recognizedToUtc.Value);
        }

        if (reversedFromUtc is not null)
        {
            filtered = filtered.Where(accrual =>
                accrual.ReversedAt is { } reversedAt && reversedAt >= reversedFromUtc.Value);
        }

        if (reversedToUtc is not null)
        {
            filtered = filtered.Where(accrual =>
                accrual.ReversedAt is { } reversedAt && reversedAt <= reversedToUtc.Value);
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
        InvoiceId? sourceInvoiceId,
        AccrualType? type,
        string? currency,
        string? description)
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

        if (type is not null)
        {
            filtered = filtered.Where(accrual => accrual.Type == type.Value);
        }

        if (currency is not null)
        {
            var currencyFilter = new Currency(currency);
            filtered = filtered.Where(accrual => accrual.Currency == currencyFilter);
        }

        if (description is not null)
        {
            filtered = filtered.Where(accrual => accrual.Description == description);
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
