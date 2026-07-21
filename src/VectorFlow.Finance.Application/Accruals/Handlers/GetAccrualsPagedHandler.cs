using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals.Queries;
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
        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(query.FinanceWorkspaceId);
            EnsurePaging(query.Page, query.PageSize);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<PageResult<AccrualDto>>.ValidationFailed(ex.Message);
        }

        var (accruals, totalCount) = await _repository.ListPagedAsync(
            financeWorkspaceId,
            query.Page,
            query.PageSize,
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
}
