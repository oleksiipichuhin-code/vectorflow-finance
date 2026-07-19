using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.GeneralLedger;
using VectorFlow.Finance.Application.GeneralLedger.Handlers;
using VectorFlow.Finance.Application.GeneralLedger.Queries;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Application.Tests.GeneralLedger;

public sealed class AccountStatementApplicationTests
{
    private static readonly Guid WorkspaceId = Guid.Parse("b1000000-0000-0000-0000-000000000001");
    private static readonly Guid AccountId = Guid.Parse("b2000000-0000-0000-0000-000000000001");

    [Fact]
    public async Task Empty_finance_workspace_id_returns_ValidationFailed()
    {
        var reader = new RecordingAccountStatementReader();
        var result = await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(Guid.Empty, AccountId, null, null));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Empty_account_id_returns_ValidationFailed()
    {
        var reader = new RecordingAccountStatementReader();
        var result = await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(WorkspaceId, Guid.Empty, null, null));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Invalid_period_range_returns_ValidationFailed()
    {
        var reader = new RecordingAccountStatementReader();
        var from = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);
        var to = new DateTimeOffset(2026, 7, 19, 0, 0, 0, TimeSpan.Zero);

        var result = await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(WorkspaceId, AccountId, from, to));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, reader.CallCount);
    }

    [Fact]
    public async Task Account_not_found_returns_NotFound()
    {
        var reader = new RecordingAccountStatementReader { Result = null };

        var result = await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(WorkspaceId, AccountId, null, null));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(1, reader.CallCount);
    }

    [Fact]
    public async Task Existing_account_with_no_movements_returns_empty_statement()
    {
        var empty = CreateEmptyStatement();
        var reader = new RecordingAccountStatementReader { Result = empty };

        var result = await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(WorkspaceId, AccountId, null, null));

        Assert.True(result.IsSuccess);
        Assert.Same(empty, result.Value);
        Assert.Empty(result.Value!.Lines);
    }

    [Fact]
    public async Task Handler_returns_reader_result_unchanged()
    {
        var statement = CreateEmptyStatement() with
        {
            PeriodDebit = 10m,
            PeriodCredit = 0m,
            ClosingDebit = 10m,
            Lines =
            [
                new AccountStatementLineDto(
                    Guid.Parse("b3000000-0000-0000-0000-000000000001"),
                    Guid.Parse("b3000000-0000-0000-0000-000000000002"),
                    Guid.Parse("b3000000-0000-0000-0000-000000000003"),
                    1,
                    new DateTimeOffset(2026, 7, 19, 12, 0, 0, TimeSpan.Zero),
                    "Cash",
                    10m,
                    0m,
                    10m,
                    0m)
            ]
        };
        var reader = new RecordingAccountStatementReader { Result = statement };

        var result = await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(WorkspaceId, AccountId, null, null));

        Assert.True(result.IsSuccess);
        Assert.Same(statement, result.Value);
    }

    [Fact]
    public async Task Cancellation_token_is_propagated_to_reader()
    {
        using var cts = new CancellationTokenSource();
        var token = cts.Token;
        var reader = new RecordingAccountStatementReader { Result = CreateEmptyStatement() };

        await new GetAccountStatementHandler(reader).HandleAsync(
            new GetAccountStatementQuery(WorkspaceId, AccountId, null, null),
            token);

        Assert.True(reader.LastToken.HasValue);
        Assert.Equal(token, reader.LastToken.Value);
    }

    private static AccountStatementDto CreateEmptyStatement() =>
        new(
            WorkspaceId,
            AccountId,
            "1000",
            "Cash",
            null,
            null,
            0m,
            0m,
            0m,
            0m,
            0m,
            0m,
            Array.Empty<AccountStatementLineDto>());

    private sealed class RecordingAccountStatementReader : IAccountStatementReader
    {
        public AccountStatementDto? Result { get; set; }

        public int CallCount { get; private set; }

        public CancellationToken? LastToken { get; private set; }

        public Task<AccountStatementDto?> GetAsync(
            FinanceWorkspaceId financeWorkspaceId,
            AccountId accountId,
            DateTimeOffset? periodFromUtc,
            DateTimeOffset? periodToUtc,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastToken = cancellationToken;
            return Task.FromResult(Result);
        }
    }
}
