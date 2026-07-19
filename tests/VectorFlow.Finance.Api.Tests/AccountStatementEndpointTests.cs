using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VectorFlow.Finance.Application.GeneralLedger;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class AccountStatementEndpointTests : IAsyncLifetime
{
    private static readonly DateTimeOffset PeriodFrom = new(2026, 7, 15, 10, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset PeriodTo = new(2026, 7, 20, 10, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _factory = CreateFactory(configureServices: null);
        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Get_without_period_returns_statement_with_movements()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000001"),
            Guid.Parse("c2000000-0000-0000-0000-000000000001"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        await PostToLedgerAsync(workspaceId, await CreateBalancedPostedAsync(workspaceId, cash, revenue, 100.25m));

        var response = await _client.GetAsync(StatementUrl(workspaceId, cash));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal(cash, root.GetProperty("accountId").GetGuid());
        Assert.Equal("1000", root.GetProperty("accountCode").GetString());
        Assert.Equal("Cash", root.GetProperty("accountName").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("periodFromUtc").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("periodToUtc").ValueKind);
        Assert.Equal(100.25m, root.GetProperty("periodDebit").GetDecimal());
        Assert.Equal(0m, root.GetProperty("periodCredit").GetDecimal());
        Assert.Equal(100.25m, root.GetProperty("closingDebit").GetDecimal());
        Assert.Equal(1, root.GetProperty("lines").GetArrayLength());
        Assert.Equal(100.25m, root.GetProperty("lines")[0].GetProperty("debit").GetDecimal());
        Assert.Equal(100.25m, root.GetProperty("lines")[0].GetProperty("runningDebit").GetDecimal());
    }

    [Fact]
    public async Task Get_with_period_query_forwards_bounds_and_returns_period_fields()
    {
        var workspaceId = Guid.Parse("c1000000-0000-0000-0000-000000000002");
        var accountId = Guid.Parse("c3000000-0000-0000-0000-000000000002");
        var stub = new RecordingAccountStatementReader
        {
            Result = new AccountStatementDto(
                workspaceId,
                accountId,
                "1000",
                "Cash",
                PeriodFrom,
                PeriodTo,
                40m,
                0m,
                10m,
                0m,
                50m,
                0m,
                [
                    new AccountStatementLineDto(
                        Guid.Parse("c4000000-0000-0000-0000-000000000002"),
                        Guid.Parse("c5000000-0000-0000-0000-000000000002"),
                        Guid.Parse("c6000000-0000-0000-0000-000000000002"),
                        1,
                        PeriodFrom,
                        "In period",
                        10m,
                        0m,
                        50m,
                        0m)
                ])
        };

        await using var factory = CreateFactory(services =>
        {
            services.RemoveAll<IAccountStatementReader>();
            services.AddSingleton<IAccountStatementReader>(stub);
        });
        using var client = factory.CreateClient();

        var from = Uri.EscapeDataString(PeriodFrom.ToString("o"));
        var to = Uri.EscapeDataString(PeriodTo.ToString("o"));
        var response = await client.GetAsync(
            $"{StatementUrl(workspaceId, accountId)}?periodFromUtc={from}&periodToUtc={to}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, stub.CallCount);
        Assert.Equal(workspaceId, stub.LastWorkspaceId);
        Assert.Equal(accountId, stub.LastAccountId);
        Assert.Equal(PeriodFrom, stub.LastPeriodFromUtc);
        Assert.Equal(PeriodTo, stub.LastPeriodToUtc);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(PeriodFrom, root.GetProperty("periodFromUtc").GetDateTimeOffset());
        Assert.Equal(PeriodTo, root.GetProperty("periodToUtc").GetDateTimeOffset());
        Assert.Equal(40m, root.GetProperty("openingDebit").GetDecimal());
        Assert.Equal(10m, root.GetProperty("periodDebit").GetDecimal());
        Assert.Equal(50m, root.GetProperty("closingDebit").GetDecimal());
        Assert.Equal(1, root.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Get_unknown_workspace_returns_not_found()
    {
        var unknownWorkspace = Guid.Parse("c1000000-0000-0000-0000-000000000099");
        var accountId = Guid.Parse("c3000000-0000-0000-0000-000000000099");

        var response = await _client.GetAsync(StatementUrl(unknownWorkspace, accountId));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Get_unknown_account_returns_not_found()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000003"),
            Guid.Parse("c2000000-0000-0000-0000-000000000003"));

        var response = await _client.GetAsync(StatementUrl(workspaceId, Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Get_invalid_period_range_returns_bad_request()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000004"),
            Guid.Parse("c2000000-0000-0000-0000-000000000004"));
        var cash = await CreateAccountAsync(workspaceId, "1000", "Cash", "Asset");

        var from = Uri.EscapeDataString(PeriodTo.ToString("o"));
        var to = Uri.EscapeDataString(PeriodFrom.ToString("o"));
        var response = await _client.GetAsync(
            $"{StatementUrl(workspaceId, cash)}?periodFromUtc={from}&periodToUtc={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Get_maps_handler_success_payload_to_http_json()
    {
        var workspaceId = Guid.Parse("c1000000-0000-0000-0000-000000000005");
        var accountId = Guid.Parse("c3000000-0000-0000-0000-000000000005");
        var postingId = Guid.Parse("c4000000-0000-0000-0000-000000000005");
        var journalId = Guid.Parse("c5000000-0000-0000-0000-000000000005");
        var sourceLineId = Guid.Parse("c6000000-0000-0000-0000-000000000005");
        var postedAt = new DateTimeOffset(2026, 7, 18, 12, 0, 0, TimeSpan.Zero);

        var statement = new AccountStatementDto(
            workspaceId,
            accountId,
            "1000",
            "Cash Mapped",
            null,
            null,
            0m,
            0m,
            75.5m,
            0m,
            75.5m,
            0m,
            [
                new AccountStatementLineDto(
                    postingId,
                    journalId,
                    sourceLineId,
                    2,
                    postedAt,
                    "Mapped line",
                    75.5m,
                    0m,
                    75.5m,
                    0m)
            ]);

        await using var factory = CreateFactory(services =>
        {
            services.RemoveAll<IAccountStatementReader>();
            services.AddSingleton<IAccountStatementReader>(
                new RecordingAccountStatementReader { Result = statement });
        });
        using var client = factory.CreateClient();

        var response = await client.GetAsync(StatementUrl(workspaceId, accountId));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal(accountId, root.GetProperty("accountId").GetGuid());
        Assert.Equal("1000", root.GetProperty("accountCode").GetString());
        Assert.Equal("Cash Mapped", root.GetProperty("accountName").GetString());
        Assert.Equal(75.5m, root.GetProperty("periodDebit").GetDecimal());
        Assert.Equal(75.5m, root.GetProperty("closingDebit").GetDecimal());

        var line = root.GetProperty("lines")[0];
        Assert.Equal(postingId, line.GetProperty("ledgerPostingId").GetGuid());
        Assert.Equal(journalId, line.GetProperty("journalEntryId").GetGuid());
        Assert.Equal(sourceLineId, line.GetProperty("sourceJournalEntryLineId").GetGuid());
        Assert.Equal(2, line.GetProperty("sequence").GetInt32());
        Assert.Equal(postedAt, line.GetProperty("postedAtUtc").GetDateTimeOffset());
        Assert.Equal("Mapped line", line.GetProperty("description").GetString());
        Assert.Equal(75.5m, line.GetProperty("debit").GetDecimal());
        Assert.Equal(0m, line.GetProperty("credit").GetDecimal());
        Assert.Equal(75.5m, line.GetProperty("runningDebit").GetDecimal());
        Assert.Equal(0m, line.GetProperty("runningCredit").GetDecimal());
    }

    [Fact]
    public async Task Swagger_document_includes_account_statement_route_and_operation()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains(
            "/api/finance-workspaces/{financeWorkspaceId}/accounts/{accountId}/statement",
            json);
        Assert.Contains("GetAccountStatement", json);
        Assert.Contains("AccountStatements", json);
    }

    private WebApplicationFactory<Program> CreateFactory(Action<IServiceCollection>? configureServices) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("environment", "Development");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll(typeof(DbContextOptions<FinanceDbContext>));
                services.RemoveAll(typeof(FinanceDbContext));
                services.AddDbContext<FinanceDbContext>(options => options.UseSqlite(_connection));
                configureServices?.Invoke(services);
            });
        });

    private static string StatementUrl(Guid workspaceId, Guid accountId) =>
        $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/statement";

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Statement Workspace",
            defaultCurrency = "UAH"
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var document = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<Guid> CreateAccountAsync(Guid workspaceId, string code, string name, string type)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            new { code, name, type });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<(Guid Cash, Guid Revenue)> CreateCashAndRevenueAsync(Guid workspaceId)
    {
        var cash = await CreateAccountAsync(workspaceId, "1000", "Cash", "Asset");
        var revenue = await CreateAccountAsync(workspaceId, "4000", "Revenue", "Revenue");
        return (cash, revenue);
    }

    private async Task<Guid> CreateBalancedPostedAsync(
        Guid workspaceId,
        Guid cash,
        Guid revenue,
        decimal amount)
    {
        var entryResponse = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries",
            new { name = "Sale" });
        Assert.Equal(HttpStatusCode.Created, entryResponse.StatusCode);
        using var entryDoc = JsonDocument.Parse(await entryResponse.Content.ReadAsStringAsync());
        var entryId = entryDoc.RootElement.GetProperty("id").GetGuid();

        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = amount, credit = 0m, description = "Cash" });
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = revenue, debit = 0m, credit = amount, description = "Revenue" });

        var post = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/post",
            null);
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        return entryId;
    }

    private async Task PostToLedgerAsync(Guid workspaceId, Guid journalEntryId)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task AssertErrorAsync(HttpResponseMessage response, string error)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(error, document.RootElement.GetProperty("error").GetString());
    }

    private sealed class RecordingAccountStatementReader : IAccountStatementReader
    {
        public AccountStatementDto? Result { get; set; }
        public int CallCount { get; private set; }
        public Guid? LastWorkspaceId { get; private set; }
        public Guid? LastAccountId { get; private set; }
        public DateTimeOffset? LastPeriodFromUtc { get; private set; }
        public DateTimeOffset? LastPeriodToUtc { get; private set; }

        public Task<AccountStatementDto?> GetAsync(
            FinanceWorkspaceId financeWorkspaceId,
            AccountId accountId,
            DateTimeOffset? periodFromUtc,
            DateTimeOffset? periodToUtc,
            CancellationToken cancellationToken = default)
        {
            CallCount++;
            LastWorkspaceId = financeWorkspaceId.Value;
            LastAccountId = accountId.Value;
            LastPeriodFromUtc = periodFromUtc;
            LastPeriodToUtc = periodToUtc;
            return Task.FromResult(Result);
        }
    }
}
