using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Application.GeneralLedger;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;

namespace VectorFlow.Finance.Infrastructure.GeneralLedger;

public sealed class AccountStatementReader : IAccountStatementReader
{
    private readonly FinanceDbContext _dbContext;

    public AccountStatementReader(FinanceDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<AccountStatementDto?> GetAsync(
        FinanceWorkspaceId financeWorkspaceId,
        AccountId accountId,
        DateTimeOffset? periodFromUtc,
        DateTimeOffset? periodToUtc,
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

        var allRows = await (
                from posting in _dbContext.LedgerPostings.AsNoTracking()
                where posting.FinanceWorkspaceId == financeWorkspaceId
                from line in posting.Lines
                where line.FinancialAccountId == accountId
                select new AccountLineRow(
                    posting.Id.Value,
                    posting.JournalEntryId.Value,
                    line.SourceJournalEntryLineId.Value,
                    line.Sequence,
                    posting.PostedAtUtc,
                    line.Description,
                    line.Debit,
                    line.Credit))
            .ToListAsync(cancellationToken);

        var openingNet = 0m;
        if (periodFromUtc is not null)
        {
            openingNet = allRows
                .Where(row => row.PostedAtUtc < periodFromUtc.Value)
                .Sum(row => row.Debit - row.Credit);
        }

        var periodRows = allRows
            .Where(row =>
                (periodFromUtc is null || row.PostedAtUtc >= periodFromUtc.Value) &&
                (periodToUtc is null || row.PostedAtUtc <= periodToUtc.Value))
            .OrderBy(row => row.PostedAtUtc)
            .ThenBy(row => row.LedgerPostingId)
            .ThenBy(row => row.Sequence)
            .ThenBy(row => row.SourceJournalEntryLineId)
            .ToList();

        var periodDebit = periodRows.Sum(row => row.Debit);
        var periodCredit = periodRows.Sum(row => row.Credit);
        var closingNet = openingNet + periodDebit - periodCredit;

        var (openingDebit, openingCredit) = AccountStatementBalancePresentation.FromNet(openingNet);
        var (closingDebit, closingCredit) = AccountStatementBalancePresentation.FromNet(closingNet);

        var runningNet = openingNet;
        var lines = new List<AccountStatementLineDto>(periodRows.Count);
        foreach (var row in periodRows)
        {
            runningNet += row.Debit - row.Credit;
            var (runningDebit, runningCredit) = AccountStatementBalancePresentation.FromNet(runningNet);
            lines.Add(new AccountStatementLineDto(
                row.LedgerPostingId,
                row.JournalEntryId,
                row.SourceJournalEntryLineId,
                row.Sequence,
                row.PostedAtUtc,
                row.Description,
                row.Debit,
                row.Credit,
                runningDebit,
                runningCredit));
        }

        return new AccountStatementDto(
            financeWorkspaceId.Value,
            account.Id.Value,
            account.Code.Value,
            account.Name,
            periodFromUtc,
            periodToUtc,
            openingDebit,
            openingCredit,
            periodDebit,
            periodCredit,
            closingDebit,
            closingCredit,
            lines);
    }

    private sealed record AccountLineRow(
        Guid LedgerPostingId,
        Guid JournalEntryId,
        Guid SourceJournalEntryLineId,
        int Sequence,
        DateTimeOffset PostedAtUtc,
        string? Description,
        decimal Debit,
        decimal Credit);
}
