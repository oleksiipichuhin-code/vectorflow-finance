using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.Persistence.Repositories;

public sealed class AccountBalanceReader : IAccountBalanceReader
{
    private readonly FinanceDbContext _dbContext;

    public AccountBalanceReader(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<AccountBalanceDto?> GetByAccountIdAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId accountId,
        CancellationToken cancellationToken = default)
    {
        var account = await _dbContext.Accounts
            .AsNoTracking()
            .SingleOrDefaultAsync(
                candidate =>
                    candidate.FinanceWorkspaceId == financeWorkspaceId &&
                    candidate.Id == accountId,
                cancellationToken);

        if (account is null)
        {
            return null;
        }

        var totals = await AggregateTotalsAsync(financeWorkspaceId, accountId, cancellationToken);
        return AccountBalanceCalculator.ToDto(
            account.Id.Value,
            account.Code.Value,
            account.Name,
            totals.DebitTotal,
            totals.CreditTotal);
    }

    public async Task<IReadOnlyList<AccountBalanceSummaryDto>> ListByWorkspaceAsync(
        FinanceWorkspaceId financeWorkspaceId,
        CancellationToken cancellationToken = default)
    {
        var accounts = await _dbContext.Accounts
            .AsNoTracking()
            .Where(account => account.FinanceWorkspaceId == financeWorkspaceId)
            .ToListAsync(cancellationToken);

        var totalsByAccount = await (
                from posting in _dbContext.LedgerPostings.AsNoTracking()
                where posting.FinanceWorkspaceId == financeWorkspaceId
                from line in posting.Lines
                group line by line.FinancialAccountId into grouped
                select new
                {
                    AccountId = grouped.Key,
                    DebitTotal = grouped.Sum(line => line.Debit),
                    CreditTotal = grouped.Sum(line => line.Credit)
                })
            .ToDictionaryAsync(
                row => row.AccountId,
                row => (row.DebitTotal, row.CreditTotal),
                cancellationToken);

        return accounts
            .OrderBy(account => account.Code.Value, StringComparer.Ordinal)
            .ThenBy(account => account.Id.Value)
            .Select(account =>
            {
                totalsByAccount.TryGetValue(account.Id, out var totals);
                return AccountBalanceCalculator.ToSummary(
                    account.Id.Value,
                    account.Code.Value,
                    account.Name,
                    totals.DebitTotal,
                    totals.CreditTotal);
            })
            .ToArray();
    }

    private async Task<(decimal DebitTotal, decimal CreditTotal)> AggregateTotalsAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId accountId,
        CancellationToken cancellationToken)
    {
        var lines = await (
                from posting in _dbContext.LedgerPostings.AsNoTracking()
                where posting.FinanceWorkspaceId == financeWorkspaceId
                from line in posting.Lines
                where line.FinancialAccountId == accountId
                select new { line.Debit, line.Credit })
            .ToListAsync(cancellationToken);

        if (lines.Count == 0)
        {
            return (0m, 0m);
        }

        return (lines.Sum(line => line.Debit), lines.Sum(line => line.Credit));
    }
}
