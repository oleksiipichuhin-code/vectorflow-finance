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

public sealed class LedgerPostingEndpointTests : IAsyncLifetime
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
    public async Task Post_creates_ledger_posting_from_posted_journal_entry()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000001"),
            Guid.Parse("c2000000-0000-0000-0000-000000000001"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        var entryId = await CreateBalancedPostedAsync(workspaceId, cash, revenue, 100.25m);

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId = entryId });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.NotEqual(Guid.Empty, root.GetProperty("id").GetGuid());
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal(entryId, root.GetProperty("journalEntryId").GetGuid());
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("postedAtUtc").ValueKind);
        Assert.Equal(100.25m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(100.25m, root.GetProperty("totalCredit").GetDecimal());
        Assert.Equal(2, root.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Post_repeated_request_is_idempotent()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000002"),
            Guid.Parse("c2000000-0000-0000-0000-000000000002"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        var entryId = await CreateBalancedPostedAsync(workspaceId, cash, revenue);

        var first = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId = entryId });
        var second = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId = entryId });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);

        using var firstDoc = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
        using var secondDoc = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        Assert.Equal(
            firstDoc.RootElement.GetProperty("id").GetGuid(),
            secondDoc.RootElement.GetProperty("id").GetGuid());

        var list = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/ledger");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var listDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(1, listDoc.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task Post_missing_journal_entry_returns_not_found()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000003"),
            Guid.Parse("c2000000-0000-0000-0000-000000000003"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId = Guid.NewGuid() });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Post_draft_journal_entry_returns_conflict()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000004"),
            Guid.Parse("c2000000-0000-0000-0000-000000000004"));
        var cash = await CreateAccountAsync(workspaceId, "1000", "Cash", "Asset");
        var entryId = await CreateEntryAsync(workspaceId, "Draft only");
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 10m, credit = 0m, description = (string?)null });

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId = entryId });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertErrorAsync(response, "Conflict");
    }

    [Fact]
    public async Task Get_by_id_and_by_journal_entry_and_list()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000005"),
            Guid.Parse("c2000000-0000-0000-0000-000000000005"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000005"),
            Guid.Parse("d2000000-0000-0000-0000-000000000005"));
        var (cashA, revenueA) = await CreateCashAndRevenueAsync(workspaceA);
        var (cashB, revenueB) = await CreateCashAndRevenueAsync(workspaceB);

        var entryOlder = await CreateBalancedPostedAsync(workspaceA, cashA, revenueA, 50m);
        await Task.Delay(20);
        var entryNewer = await CreateBalancedPostedAsync(workspaceA, cashA, revenueA, 75m, "1100", "4100");
        var entryOther = await CreateBalancedPostedAsync(workspaceB, cashB, revenueB, 10m);

        var postOlder = await PostToLedgerAsync(workspaceA, entryOlder);
        var postNewer = await PostToLedgerAsync(workspaceA, entryNewer);
        await PostToLedgerAsync(workspaceB, entryOther);

        var byId = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/ledger/{postOlder}");
        Assert.Equal(HttpStatusCode.OK, byId.StatusCode);
        using var byIdDoc = JsonDocument.Parse(await byId.Content.ReadAsStringAsync());
        Assert.Equal(postOlder, byIdDoc.RootElement.GetProperty("id").GetGuid());
        Assert.Equal(entryOlder, byIdDoc.RootElement.GetProperty("journalEntryId").GetGuid());

        var byJournal = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/ledger/by-journal/{entryOlder}");
        Assert.Equal(HttpStatusCode.OK, byJournal.StatusCode);
        using var byJournalDoc = JsonDocument.Parse(await byJournal.Content.ReadAsStringAsync());
        Assert.Equal(postOlder, byJournalDoc.RootElement.GetProperty("id").GetGuid());

        var list = await _client.GetAsync($"/api/finance-workspaces/{workspaceA}/ledger");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var listDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(2, listDoc.RootElement.GetArrayLength());
        Assert.Equal(postNewer, listDoc.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(postOlder, listDoc.RootElement[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Cross_workspace_isolation_returns_not_found()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000006"),
            Guid.Parse("c2000000-0000-0000-0000-000000000006"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000006"),
            Guid.Parse("d2000000-0000-0000-0000-000000000006"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceA);
        var entryId = await CreateBalancedPostedAsync(workspaceA, cash, revenue);
        var postingId = await PostToLedgerAsync(workspaceA, entryId);

        var wrongWorkspaceGet = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/ledger/{postingId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspaceGet.StatusCode);
        await AssertErrorAsync(wrongWorkspaceGet, "NotFound");

        var wrongWorkspaceByJournal = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/ledger/by-journal/{entryId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspaceByJournal.StatusCode);

        var wrongWorkspacePost = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceB}/ledger/post",
            new { journalEntryId = entryId });
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspacePost.StatusCode);

        var missing = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/ledger/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Swagger_document_includes_ledger_posting_paths()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/ledger/post", json);
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/ledger/by-journal/{journalEntryId}", json);
        Assert.Contains("PostJournalEntryToLedger", json);
        Assert.Contains("ListLedgerPostings", json);
        Assert.Contains("GetLedgerPostingById", json);
        Assert.Contains("GetLedgerPostingByJournalEntry", json);
    }

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Ledger Workspace",
            defaultCurrency = "UAH"
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var document = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<Guid> CreateEntryAsync(Guid workspaceId, string name)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries",
            new { name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
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
        decimal amount = 100m,
        string? alternateCashCode = null,
        string? alternateRevenueCode = null)
    {
        Guid cashId = cash;
        Guid revenueId = revenue;
        if (alternateCashCode is not null && alternateRevenueCode is not null)
        {
            cashId = await CreateAccountAsync(workspaceId, alternateCashCode, "Cash Alt", "Asset");
            revenueId = await CreateAccountAsync(workspaceId, alternateRevenueCode, "Revenue Alt", "Revenue");
        }

        var entryId = await CreateEntryAsync(workspaceId, "Balanced posted");
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = cashId, debit = amount, credit = 0m, description = "Cash" });
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = revenueId, debit = 0m, credit = amount, description = "Revenue" });
        var post = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/post",
            null);
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        return entryId;
    }

    private async Task<Guid> PostToLedgerAsync(Guid workspaceId, Guid journalEntryId)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/ledger/post",
            new { journalEntryId });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task AssertErrorAsync(HttpResponseMessage response, string error)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(error, document.RootElement.GetProperty("error").GetString());
    }
}
