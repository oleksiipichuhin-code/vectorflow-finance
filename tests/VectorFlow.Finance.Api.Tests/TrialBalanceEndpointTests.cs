using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VectorFlow.Finance.Application.AccountBalances;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class TrialBalanceEndpointTests : IAsyncLifetime
{
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
    public async Task Get_returns_balanced_trial_balance_with_totals_and_lines()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a7000000-0000-0000-0000-000000000001"),
            Guid.Parse("a8000000-0000-0000-0000-000000000001"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        await CreateAccountAsync(workspaceId, "1500", "Unused", "Asset");
        await PostToLedgerAsync(workspaceId, await CreateBalancedPostedAsync(workspaceId, cash, revenue, 100.25m));

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/trial-balance");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.True(root.TryGetProperty("generatedAtUtc", out _));
        Assert.Equal(100.25m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(100.25m, root.GetProperty("totalCredit").GetDecimal());
        Assert.True(root.GetProperty("isBalanced").GetBoolean());
        Assert.Equal(3, root.GetProperty("lines").GetArrayLength());
        Assert.Equal("1000", root.GetProperty("lines")[0].GetProperty("accountCode").GetString());
        Assert.Equal(100.25m, root.GetProperty("lines")[0].GetProperty("debitTotal").GetDecimal());
        Assert.Equal("Debit", root.GetProperty("lines")[0].GetProperty("balanceSide").GetString());
        Assert.Equal("4000", root.GetProperty("lines")[2].GetProperty("accountCode").GetString());
        Assert.Equal(100.25m, root.GetProperty("lines")[2].GetProperty("creditTotal").GetDecimal());
        Assert.Equal("Credit", root.GetProperty("lines")[2].GetProperty("balanceSide").GetString());
    }

    [Fact]
    public async Task Get_empty_workspace_returns_balanced_zero_totals()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a7000000-0000-0000-0000-000000000002"),
            Guid.Parse("a8000000-0000-0000-0000-000000000002"));

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/trial-balance");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(0, root.GetProperty("lines").GetArrayLength());
        Assert.Equal(0m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(0m, root.GetProperty("totalCredit").GetDecimal());
        Assert.True(root.GetProperty("isBalanced").GetBoolean());
    }

    [Fact]
    public async Task Get_does_not_expose_other_workspace_data()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a7000000-0000-0000-0000-000000000003"),
            Guid.Parse("a8000000-0000-0000-0000-000000000003"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("a9000000-0000-0000-0000-000000000003"),
            Guid.Parse("aa000000-0000-0000-0000-000000000003"));
        var (cashA, revenueA) = await CreateCashAndRevenueAsync(workspaceA);
        var (cashB, revenueB) = await CreateCashAndRevenueAsync(workspaceB);
        await PostToLedgerAsync(workspaceA, await CreateBalancedPostedAsync(workspaceA, cashA, revenueA, 40m));
        await PostToLedgerAsync(workspaceB, await CreateBalancedPostedAsync(workspaceB, cashB, revenueB, 999m));

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceA}/trial-balance");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(40m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(40m, root.GetProperty("totalCredit").GetDecimal());
        Assert.DoesNotContain(
            root.GetProperty("lines").EnumerateArray(),
            line => line.GetProperty("debitTotal").GetDecimal() == 999m
                    || line.GetProperty("creditTotal").GetDecimal() == 999m);
    }

    [Fact]
    public async Task Get_returns_isBalanced_false_for_unbalanced_projection()
    {
        var workspaceId = Guid.Parse("a7000000-0000-0000-0000-000000000004");
        var cashId = Guid.Parse("a7100000-0000-0000-0000-000000000004");
        var revenueId = Guid.Parse("a7200000-0000-0000-0000-000000000004");

        await using var factory = CreateFactory(services =>
        {
            services.RemoveAll<IAccountBalanceReader>();
            services.AddSingleton<IAccountBalanceReader>(
                new StubAccountBalanceReader(workspaceId, cashId, revenueId));
        });
        using var client = factory.CreateClient();

        var response = await client.GetAsync($"/api/finance-workspaces/{workspaceId}/trial-balance");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(100m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(80m, root.GetProperty("totalCredit").GetDecimal());
        Assert.False(root.GetProperty("isBalanced").GetBoolean());
        Assert.Equal(2, root.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Swagger_document_includes_trial_balance_route_and_operation()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/trial-balance", json);
        Assert.Contains("GetTrialBalance", json);
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

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Trial Balance Workspace",
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

    private sealed class StubAccountBalanceReader : IAccountBalanceReader
    {
        private readonly Guid _workspaceId;
        private readonly IReadOnlyList<AccountBalanceSummaryDto> _summaries;

        public StubAccountBalanceReader(Guid workspaceId, Guid cashId, Guid revenueId)
        {
            _workspaceId = workspaceId;
            _summaries =
            [
                AccountBalanceCalculator.ToSummary(cashId, "1000", "Cash", 100m, 0m),
                AccountBalanceCalculator.ToSummary(revenueId, "4000", "Revenue", 0m, 80m)
            ];
        }

        public Task<AccountBalanceDto?> GetByAccountIdAsync(
            FinanceWorkspaceId financeWorkspaceId,
            AccountId accountId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<AccountBalanceDto?>(null);

        public Task<IReadOnlyList<AccountBalanceSummaryDto>> ListByWorkspaceAsync(
            FinanceWorkspaceId financeWorkspaceId,
            CancellationToken cancellationToken = default)
        {
            if (financeWorkspaceId.Value != _workspaceId)
            {
                return Task.FromResult<IReadOnlyList<AccountBalanceSummaryDto>>([]);
            }

            return Task.FromResult(_summaries);
        }
    }
}
