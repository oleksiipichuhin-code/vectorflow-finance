using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class AccountBalanceEndpointTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("environment", "Development");
            builder.ConfigureServices(services =>
            {
                services.RemoveAll(typeof(DbContextOptions<FinanceDbContext>));
                services.RemoveAll(typeof(FinanceDbContext));

                services.AddDbContext<FinanceDbContext>(options => options.UseSqlite(_connection));
            });
        });

        _client = _factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        _client.Dispose();
        await _factory.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task List_empty_workspace_returns_empty_array()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("f1000000-0000-0000-0000-000000000001"),
            Guid.Parse("f2000000-0000-0000-0000-000000000001"));

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/balances");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task List_and_get_return_projected_balances()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("f1000000-0000-0000-0000-000000000002"),
            Guid.Parse("f2000000-0000-0000-0000-000000000002"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        var entryId = await CreateBalancedPostedAsync(workspaceId, cash, revenue, 100.25m);
        await PostToLedgerAsync(workspaceId, entryId);

        var list = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/balances");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var listDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(2, listDoc.RootElement.GetArrayLength());
        Assert.Equal("1000", listDoc.RootElement[0].GetProperty("accountCode").GetString());
        Assert.Equal(100.25m, listDoc.RootElement[0].GetProperty("debitTotal").GetDecimal());
        Assert.Equal("Debit", listDoc.RootElement[0].GetProperty("balanceSide").GetString());
        Assert.Equal("4000", listDoc.RootElement[1].GetProperty("accountCode").GetString());
        Assert.Equal(100.25m, listDoc.RootElement[1].GetProperty("creditTotal").GetDecimal());
        Assert.Equal("Credit", listDoc.RootElement[1].GetProperty("balanceSide").GetString());

        var byId = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/balances/{cash}");
        Assert.Equal(HttpStatusCode.OK, byId.StatusCode);
        using var byIdDoc = JsonDocument.Parse(await byId.Content.ReadAsStringAsync());
        Assert.Equal(cash, byIdDoc.RootElement.GetProperty("accountId").GetGuid());
        Assert.Equal(100.25m, byIdDoc.RootElement.GetProperty("balance").GetDecimal());
        Assert.Equal("Debit", byIdDoc.RootElement.GetProperty("balanceSide").GetString());
    }

    [Fact]
    public async Task Get_unknown_account_returns_not_found()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("f1000000-0000-0000-0000-000000000003"),
            Guid.Parse("f2000000-0000-0000-0000-000000000003"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/balances/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Cross_workspace_isolation_returns_not_found_and_separate_lists()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("f1000000-0000-0000-0000-000000000004"),
            Guid.Parse("f2000000-0000-0000-0000-000000000004"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("f3000000-0000-0000-0000-000000000004"),
            Guid.Parse("f4000000-0000-0000-0000-000000000004"));
        var (cashA, revenueA) = await CreateCashAndRevenueAsync(workspaceA);
        var (cashB, revenueB) = await CreateCashAndRevenueAsync(workspaceB);
        await PostToLedgerAsync(workspaceA, await CreateBalancedPostedAsync(workspaceA, cashA, revenueA, 40m));
        await PostToLedgerAsync(workspaceB, await CreateBalancedPostedAsync(workspaceB, cashB, revenueB, 999m));

        var wrongWorkspace = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/balances/{cashA}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);

        var listA = await _client.GetAsync($"/api/finance-workspaces/{workspaceA}/balances");
        Assert.Equal(HttpStatusCode.OK, listA.StatusCode);
        using var listADoc = JsonDocument.Parse(await listA.Content.ReadAsStringAsync());
        Assert.Equal(2, listADoc.RootElement.GetArrayLength());
        Assert.Equal(40m, listADoc.RootElement[0].GetProperty("debitTotal").GetDecimal());
        Assert.DoesNotContain(
            listADoc.RootElement.EnumerateArray(),
            row => row.GetProperty("debitTotal").GetDecimal() == 999m
                   || row.GetProperty("creditTotal").GetDecimal() == 999m);
    }

    [Fact]
    public async Task Swagger_document_includes_account_balance_paths()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/balances", json);
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/balances/{accountId}", json);
        Assert.Contains("ListAccountBalances", json);
        Assert.Contains("GetAccountBalanceById", json);
    }

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Balance Workspace",
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
}
