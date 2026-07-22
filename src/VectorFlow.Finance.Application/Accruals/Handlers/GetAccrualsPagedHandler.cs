using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Queries;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

public sealed class GetAccrualsPagedHandler
{
    public const int MaxPageSize = 100;

    private readonly IAccrualRepository _repository;

    public GetAccrualsPagedHandler(IAccrualRepository repository)
    {
        _repository = repository;
    }

    public async Task<ApplicationResult<PageResult<AccrualDto>>> HandleAsync(
        GetAccrualsPagedQuery query,
        CancellationToken cancellationToken = default)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccrualStatus? status;
        InvoiceId? sourceInvoiceId;
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            EnsurePaging(query.Page, query.PageSize);
            status = ParseStatusFilter(query.Status);
            EnsureCreatedAtRange(query.CreatedFromUtc, query.CreatedToUtc);
            sourceInvoiceId = ParseSourceInvoiceIdFilter(query.SourceInvoiceId);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<PageResult<AccrualDto>>.ValidationFailed(ex.Message);
        }

        var (accruals, totalCount) = await _repository.ListPagedAsync(
            financeWorkspaceId,
            query.Page,
            query.PageSize,
            status,
            query.CreatedFromUtc,
            query.CreatedToUtc,
            sourceInvoiceId,
            cancellationToken);

        var page = new PageResult<AccrualDto>(
            accruals.Select(AccrualMapper.ToDto).ToArray(),
            query.Page,
            query.PageSize,
            totalCount);

        return ApplicationResult<PageResult<AccrualDto>>.Success(page);
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
    /// <c>Draft</c>/<c>Recognized</c>/<c>Reversed</c> value is validation failure (Ordinal, no trim/case-fold).
    /// </summary>
    private static AccrualStatus? ParseStatusFilter(string? status)
    {
        if (status is null)
        {
            return null;
        }

        if (string.Equals(status, nameof(AccrualStatus.Draft), StringComparison.Ordinal))
        {
            return AccrualStatus.Draft;
        }

        if (string.Equals(status, nameof(AccrualStatus.Recognized), StringComparison.Ordinal))
        {
            return AccrualStatus.Recognized;
        }

        if (string.Equals(status, nameof(AccrualStatus.Reversed), StringComparison.Ordinal))
        {
            return AccrualStatus.Reversed;
        }

        throw new ArgumentException(
            "Status must be exactly Draft, Recognized, or Reversed when provided.",
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

    /// <summary>
    /// Missing (<c>null</c>) means no SourceInvoiceId filter. When provided, empty Guid is rejected
    /// via <see cref="InvoiceId"/> (same posture as list-by-invoice). Positive match only; no IS NULL mode.
    /// </summary>
    private static InvoiceId? ParseSourceInvoiceIdFilter(Guid? sourceInvoiceId) =>
        sourceInvoiceId is null ? null : new InvoiceId(sourceInvoiceId.Value);
}
