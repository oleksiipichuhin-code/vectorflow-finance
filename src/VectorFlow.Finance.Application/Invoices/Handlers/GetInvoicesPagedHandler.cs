using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Queries;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Invoices.Handlers;

public sealed class GetInvoicesPagedHandler
{
    public const int MaxPageSize = 100;

    private readonly IInvoiceRepository _repository;

    public GetInvoicesPagedHandler(IInvoiceRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<PageResult<InvoiceDto>>> HandleAsync(
        GetInvoicesPagedQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        InvoiceStatus? status;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            EnsurePaging(query.Page, query.PageSize);
            status = ParseStatusFilter(query.Status);
            EnsureCreatedAtRange(query.CreatedFromUtc, query.CreatedToUtc);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<PageResult<InvoiceDto>>.ValidationFailed(ex.Message);
        }

        var (invoices, totalCount) = await _repository.ListPagedAsync(
            financeWorkspaceId,
            query.Page,
            query.PageSize,
            status,
            query.CreatedFromUtc,
            query.CreatedToUtc,
            cancellationToken);

        var page = new PageResult<InvoiceDto>(
            invoices.Select(InvoiceMapper.ToDto).ToArray(),
            query.Page,
            query.PageSize,
            totalCount);

        return ApplicationResult<PageResult<InvoiceDto>>.Success(page);
    }

    private static void EnsurePaging(int page, int pageSize)
    {
        if (page < 1)
        {
            throw new ArgumentException("Page must be greater than or equal to 1.", nameof(page));
        }

        if (pageSize < 1)
        {
            throw new ArgumentException("Page size must be greater than or equal to 1.", nameof(pageSize));
        }

        if (pageSize > MaxPageSize)
        {
            throw new ArgumentException(
                $"Page size must not exceed {MaxPageSize}.",
                nameof(pageSize));
        }
    }

    /// <summary>
    /// Missing (<c>null</c>) means no status filter. Explicit blank/whitespace or any non-exact
    /// <c>Draft</c>/<c>Issued</c> value is validation failure (Ordinal, no trim/case-fold).
    /// </summary>
    private static InvoiceStatus? ParseStatusFilter(string? status)
    {
        if (status is null)
        {
            return null;
        }

        if (string.Equals(status, nameof(InvoiceStatus.Draft), StringComparison.Ordinal))
        {
            return InvoiceStatus.Draft;
        }

        if (string.Equals(status, nameof(InvoiceStatus.Issued), StringComparison.Ordinal))
        {
            return InvoiceStatus.Issued;
        }

        throw new ArgumentException(
            "Status must be exactly Draft or Issued when provided.",
            nameof(status));
    }

    private static void EnsureCreatedAtRange(DateTimeOffset? createdFromUtc, DateTimeOffset? createdToUtc)
    {
        if (createdFromUtc is { } from && createdToUtc is { } to && from > to)
        {
            throw new ArgumentException(
                "CreatedFromUtc must not be later than CreatedToUtc.");
        }
    }
}
