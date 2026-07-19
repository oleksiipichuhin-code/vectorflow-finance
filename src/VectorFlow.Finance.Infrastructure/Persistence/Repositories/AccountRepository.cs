using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.Accounts;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Configurations;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class AccountRepository : IAccountRepository
{
    private readonly FinanceDbContext _dbContext;

    public AccountRepository(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<Account?> GetByIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId id,
        CancellationToken cancellationToken = default) =>
        _dbContext.Accounts
            .SingleOrDefaultAsync(
                account =>
                    account.FinanceWorkspaceId == financeWorkspaceId &&
                    account.Id == id,
                cancellationToken);

    public Task<Account?> GetByWorkspaceAndCodeAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountCode code,
        CancellationToken cancellationToken = default)
    {
        var normalizedCode = code.Value.ToUpperInvariant();

        return _dbContext.Accounts
            .SingleOrDefaultAsync(
                account =>
                    account.FinanceWorkspaceId == financeWorkspaceId &&
                    EF.Property<string>(account, AccountConfiguration.CodeNormalizedPropertyName) == normalizedCode,
                cancellationToken);
    }

    public async Task AddAsync(
        Account account,
        CancellationToken cancellationToken = default)
    {
        await _dbContext.Accounts.AddAsync(account, cancellationToken);
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _dbContext.SaveChangesAsync(cancellationToken);
}
