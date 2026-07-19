using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Application.AccountBalances.Handlers;
using VectorFlow.Finance.Application.AccountBalances.Queries;
using Xunit;

namespace VectorFlow.Finance.Application.Tests.AccountBalances;

public sealed class AccountBalanceApplicationTests
{
    private static readonly Guid WorkspaceA = Guid.Parse("e1000000-0000-0000-0000-000000000001");
    private static readonly Guid WorkspaceB = Guid.Parse("e1000000-0000-0000-0000-000000000002");
    private static readonly Guid CashId = Guid.Parse("e2000000-0000-0000-0000-000000000001");
    private static readonly Guid RevenueId = Guid.Parse("e2000000-0000-0000-0000-000000000002");
    private static readonly Guid EquityId = Guid.Parse("e2000000-0000-0000-0000-000000000003");

    [Fact]
    public async Task GetAccountBalance_returns_single_account_debit_balance()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash", 150m, 40m));

        var result = await new GetAccountBalanceHandler(reader).HandleAsync(
            new GetAccountBalanceQuery(WorkspaceA, CashId));

        Assert.True(result.IsSuccess);
        Assert.Equal(CashId, result.Value!.AccountId);
        Assert.Equal("1000", result.Value.AccountCode);
        Assert.Equal("Cash", result.Value.AccountName);
        Assert.Equal(150m, result.Value.DebitTotal);
        Assert.Equal(40m, result.Value.CreditTotal);
        Assert.Equal(110m, result.Value.Balance);
        Assert.Equal(AccountBalanceCalculator.DebitSide, result.Value.BalanceSide);
    }

    [Fact]
    public async Task GetAccountBalance_returns_credit_and_zero_sides()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(RevenueId, "4000", "Revenue", 10m, 90m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(EquityId, "3000", "Equity", 25m, 25m));

        var credit = await new GetAccountBalanceHandler(reader).HandleAsync(
            new GetAccountBalanceQuery(WorkspaceA, RevenueId));
        Assert.Equal(-80m, credit.Value!.Balance);
        Assert.Equal(AccountBalanceCalculator.CreditSide, credit.Value.BalanceSide);

        var zero = await new GetAccountBalanceHandler(reader).HandleAsync(
            new GetAccountBalanceQuery(WorkspaceA, EquityId));
        Assert.Equal(0m, zero.Value!.Balance);
        Assert.Equal(AccountBalanceCalculator.ZeroSide, zero.Value.BalanceSide);
    }

    [Fact]
    public async Task GetAccountBalance_missing_account_returns_NotFound()
    {
        var reader = new InMemoryAccountBalanceReader();

        var result = await new GetAccountBalanceHandler(reader).HandleAsync(
            new GetAccountBalanceQuery(WorkspaceA, CashId));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
    }

    [Fact]
    public async Task GetAccountBalances_returns_multiple_accounts_ordered_by_code()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(RevenueId, "4000", "Revenue", 0m, 100m));
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash", 100m, 0m));

        var result = await new GetAccountBalancesHandler(reader).HandleAsync(
            new GetAccountBalancesQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal("1000", result.Value[0].AccountCode);
        Assert.Equal("4000", result.Value[1].AccountCode);
        Assert.Equal(AccountBalanceCalculator.DebitSide, result.Value[0].BalanceSide);
        Assert.Equal(AccountBalanceCalculator.CreditSide, result.Value[1].BalanceSide);
    }

    [Fact]
    public async Task GetAccountBalances_isolates_workspaces()
    {
        var reader = new InMemoryAccountBalanceReader();
        reader.Seed(
            WorkspaceA,
            AccountBalanceCalculator.ToDto(CashId, "1000", "Cash A", 50m, 0m));
        reader.Seed(
            WorkspaceB,
            AccountBalanceCalculator.ToDto(
                Guid.Parse("e2000000-0000-0000-0000-000000000099"),
                "1000",
                "Cash B",
                999m,
                0m));

        var result = await new GetAccountBalancesHandler(reader).HandleAsync(
            new GetAccountBalancesQuery(WorkspaceA));

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value!);
        Assert.Equal(CashId, result.Value![0].AccountId);
        Assert.Equal(50m, result.Value[0].DebitTotal);

        var wrongWorkspace = await new GetAccountBalanceHandler(reader).HandleAsync(
            new GetAccountBalanceQuery(WorkspaceB, CashId));
        Assert.Equal(ApplicationErrorKind.NotFound, wrongWorkspace.ErrorKind);
    }

    [Fact]
    public void Calculator_maps_debit_credit_zero_sides()
    {
        Assert.Equal((10m, AccountBalanceCalculator.DebitSide), AccountBalanceCalculator.Compute(10m, 0m));
        Assert.Equal((-5m, AccountBalanceCalculator.CreditSide), AccountBalanceCalculator.Compute(0m, 5m));
        Assert.Equal((0m, AccountBalanceCalculator.ZeroSide), AccountBalanceCalculator.Compute(7m, 7m));
    }
}
