using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Application.Tests.AccountBalances;
using VectorFlow.Finance.Application.TrialBalances.Handlers;
using VectorFlow.Finance.Application.TrialBalances.Queries;
using Xunit;
using FixedClock = VectorFlow.Finance.Application.Tests.Accounts.FixedClock;

namespace VectorFlow.Finance.Application.Tests.TrialBalances;

public sealed class TrialBalanceApplicationTests
{
    private static readonly DateTimeOffset GeneratedAt =
        new(2026, 7, 19, 15, 30, 0, TimeSpan.Zero);

    private static readonly Guid WorkspaceA = Guid.Parse("f5000000-0000-0000-0000-000000000001");
    private static readonly Guid WorkspaceB = Guid.Parse("f5000000-0000-0000-0000-000000000002");
    private static readonly Guid CashId = Guid.Parse("f6000000-0000-0000-0000-000000000001");
    private static readonly Guid RevenueId = Guid.Parse("f6000000-0000-0000-0000-000000000002");
    private static readonly Guid ExpenseId = Guid.Parse("f6000000-0000-0000-0000-000000000003");

    [Fact]
    public async Task GetTrialBalance_returns_balanced_totals_for_balanced_ledger()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash", 150m, 0m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(RevenueId, "4000", "Revenue", 0m, 150m));
        var clock = new FixedClock(GeneratedAt);

        var result = await new GetTrialBalanceHandler(reader, clock).HandleAsync(
            new GetTrialBalanceQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(WorkspaceA, result.Value!.FinanceWorkspaceId);
        Assert.Equal(GeneratedAt, result.Value.GeneratedAtUtc);
        Assert.Equal(150m, result.Value.TotalDebit);
        Assert.Equal(150m, result.Value.TotalCredit);
        Assert.True(result.Value.IsBalanced);
        Assert.Equal(2, result.Value.Lines.Count);
        Assert.Equal("1000", result.Value.Lines[0].AccountCode);
        Assert.Equal("4000", result.Value.Lines[1].AccountCode);
        Assert.Equal(150m, result.Value.Lines[0].Balance);
        Assert.Equal(-150m, result.Value.Lines[1].Balance);
    }

    [Fact]
    public async Task GetTrialBalance_marks_unbalanced_when_totals_differ()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash", 100m, 0m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(RevenueId, "4000", "Revenue", 0m, 80m));
        var clock = new FixedClock(GeneratedAt);

        var result = await new GetTrialBalanceHandler(reader, clock).HandleAsync(
            new GetTrialBalanceQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(100m, result.Value!.TotalDebit);
        Assert.Equal(80m, result.Value.TotalCredit);
        Assert.False(result.Value.IsBalanced);
    }

    [Fact]
    public async Task GetTrialBalance_empty_workspace_is_balanced_with_zero_totals()
    {
        var reader = new InMemoryAccountBalanceReader();
        var clock = new FixedClock(GeneratedAt);

        var result = await new GetTrialBalanceHandler(reader, clock).HandleAsync(
            new GetTrialBalanceQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Lines);
        Assert.Equal(0m, result.Value.TotalDebit);
        Assert.Equal(0m, result.Value.TotalCredit);
        Assert.True(result.Value.IsBalanced);
    }

    [Fact]
    public async Task GetTrialBalance_includes_multiple_accounts_and_sums_totals()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash", 200m, 25m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(ExpenseId, "5000", "Expense", 40m, 0m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(RevenueId, "4000", "Revenue", 0m, 215m));
        var clock = new FixedClock(GeneratedAt);

        var result = await new GetTrialBalanceHandler(reader, clock).HandleAsync(
            new GetTrialBalanceQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(3, result.Value!.Lines.Count);
        Assert.Equal(240m, result.Value.TotalDebit);
        Assert.Equal(240m, result.Value.TotalCredit);
        Assert.True(result.Value.IsBalanced);
        Assert.Equal(
            new[] { "1000", "4000", "5000" },
            result.Value.Lines.Select(line => line.AccountCode).ToArray());
    }

    [Fact]
    public async Task GetTrialBalance_isolates_workspaces()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash A", 50m, 0m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(RevenueId, "4000", "Revenue A", 0m, 50m));
        reader.Seed(
            WorkspaceB,
            AccountBalanceCalculator.ToDto(
                Guid.Parse("f6000000-0000-0000-0000-000000000099"),
                "1000",
                "Cash B",
                999m,
                0m));
        var clock = new FixedClock(GeneratedAt);

        var result = await new GetTrialBalanceHandler(reader, clock).HandleAsync(
            new GetTrialBalanceQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Lines.Count);
        Assert.Equal(50m, result.Value.TotalDebit);
        Assert.Equal(50m, result.Value.TotalCredit);
        Assert.DoesNotContain(result.Value.Lines, line => line.DebitTotal == 999m);
    }

    [Fact]
    public async Task GetTrialBalance_empty_workspace_id_returns_ValidationFailed()
    {
        var reader = new InMemoryAccountBalanceReader();
        var clock = new FixedClock(GeneratedAt);

        var result = await new GetTrialBalanceHandler(reader, clock).HandleAsync(
            new GetTrialBalanceQuery(Guid.Empty));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
    }
}
