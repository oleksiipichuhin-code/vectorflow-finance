using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices.Queries;
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
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            EnsurePaging(query.Page, query.PageSize);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<PageResult<InvoiceDto>>.ValidationFailed(ex.Message);
        }

        var (invoices, totalCount) = await _repository.ListPagedAsync(
            financeWorkspaceId,
            query.Page,
            query.PageSize,
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
}
