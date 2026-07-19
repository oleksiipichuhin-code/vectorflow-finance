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

public sealed class JournalEntryEndpointTests : IAsyncLifetime
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
    public async Task Create_returns_draft_with_server_generated_id()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000001"),
            Guid.Parse("a2000000-0000-0000-0000-000000000001"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries",
            new { name = "  Opening entry  " });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.NotEqual(Guid.Empty, root.GetProperty("id").GetGuid());
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal("Opening entry", root.GetProperty("name").GetString());
        Assert.Equal("Draft", root.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("postedAtUtc").ValueKind);
        Assert.True(root.TryGetProperty("createdAtUtc", out _));
        Assert.True(root.TryGetProperty("updatedAtUtc", out _));
        Assert.Equal(0m, root.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(0m, root.GetProperty("totalCredit").GetDecimal());
        Assert.Equal(JsonValueKind.Array, root.GetProperty("lines").ValueKind);
        Assert.Equal(0, root.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Create_missing_workspace_returns_not_found()
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{Guid.NewGuid()}/journal-entries",
            new { name = "Entry" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Create_blank_name_returns_bad_request()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000002"),
            Guid.Parse("a2000000-0000-0000-0000-000000000002"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries",
            new { name = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_returns_only_requested_workspace_newest_first()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000003"),
            Guid.Parse("a2000000-0000-0000-0000-000000000003"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000003"),
            Guid.Parse("b2000000-0000-0000-0000-000000000003"));

        var older = await CreateEntryAsync(workspaceA, "Older");
        await Task.Delay(20);
        var newer = await CreateEntryAsync(workspaceA, "Newer");
        await CreateEntryAsync(workspaceB, "Other");

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceA}/journal-entries");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetArrayLength());
        Assert.Equal(newer, document.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(older, document.RootElement[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_empty_workspace_returns_empty_array()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000004"),
            Guid.Parse("a2000000-0000-0000-0000-000000000004"));

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/journal-entries");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task Get_returns_same_workspace_entry()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000005"),
            Guid.Parse("a2000000-0000-0000-0000-000000000005"));
        var entryId = await CreateEntryAsync(workspaceId, "Get me");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(entryId, document.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("Get me", document.RootElement.GetProperty("name").GetString());
    }

    [Fact]
    public async Task Get_missing_and_wrong_workspace_return_not_found()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000006"),
            Guid.Parse("a2000000-0000-0000-0000-000000000006"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000006"),
            Guid.Parse("b2000000-0000-0000-0000-000000000006"));
        var entryId = await CreateEntryAsync(workspaceA, "Scoped");

        var missing = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var wrongWorkspace = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/journal-entries/{entryId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);
        await AssertErrorAsync(wrongWorkspace, "NotFound");
    }

    [Fact]
    public async Task Rename_draft_succeeds_and_invalid_name_fails()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000007"),
            Guid.Parse("a2000000-0000-0000-0000-000000000007"));
        var entryId = await CreateEntryAsync(workspaceId, "Before");

        var rename = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/rename",
            new { name = "After" });
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);
        using var renamed = JsonDocument.Parse(await rename.Content.ReadAsStringAsync());
        Assert.Equal("After", renamed.RootElement.GetProperty("name").GetString());

        var invalid = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/rename",
            new { name = "   " });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
    }

    [Fact]
    public async Task Rename_posted_returns_conflict_and_wrong_workspace_not_found()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000008"),
            Guid.Parse("a2000000-0000-0000-0000-000000000008"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000008"),
            Guid.Parse("b2000000-0000-0000-0000-000000000008"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceA);
        var entryId = await CreateBalancedPostedAsync(workspaceA, cash, revenue);

        var postedRename = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/rename",
            new { name = "Nope" });
        Assert.Equal(HttpStatusCode.Conflict, postedRename.StatusCode);
        await AssertErrorAsync(postedRename, "Conflict");

        var wrongWorkspace = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceB}/journal-entries/{entryId}/rename",
            new { name = "Nope" });
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);
    }

    [Fact]
    public async Task AddLine_validations_and_workspace_account_rules()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000009"),
            Guid.Parse("a2000000-0000-0000-0000-000000000009"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000009"),
            Guid.Parse("b2000000-0000-0000-0000-000000000009"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceA);
        var foreignCash = await CreateAccountAsync(workspaceB, "1000", "Foreign Cash", "Asset");
        var entryId = await CreateEntryAsync(workspaceA, "Lines");

        var debit = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 100.25m, credit = 0m, description = "Cash" });
        Assert.Equal(HttpStatusCode.OK, debit.StatusCode);

        var credit = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = revenue, debit = 0m, credit = 100.25m, description = "Revenue" });
        Assert.Equal(HttpStatusCode.OK, credit.StatusCode);
        using var creditDoc = JsonDocument.Parse(await credit.Content.ReadAsStringAsync());
        Assert.Equal(2, creditDoc.RootElement.GetProperty("lines").GetArrayLength());
        Assert.Equal(100.25m, creditDoc.RootElement.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(100.25m, creditDoc.RootElement.GetProperty("totalCredit").GetDecimal());

        var zero = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 0m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.BadRequest, zero.StatusCode);

        var negative = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = -1m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);

        var both = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 1m, credit = 1m, description = (string?)null });
        Assert.Equal(HttpStatusCode.BadRequest, both.StatusCode);

        var missingAccount = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = Guid.NewGuid(), debit = 1m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.NotFound, missingAccount.StatusCode);

        var foreign = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = foreignCash, debit = 1m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
    }

    [Fact]
    public async Task AddLine_on_posted_returns_conflict()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000010"),
            Guid.Parse("a2000000-0000-0000-0000-000000000010"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        var entryId = await CreateBalancedPostedAsync(workspaceId, cash, revenue);

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 1m, credit = 0m, description = (string?)null });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task UpdateLine_and_remove_line_behaviors()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000011"),
            Guid.Parse("a2000000-0000-0000-0000-000000000011"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000011"),
            Guid.Parse("b2000000-0000-0000-0000-000000000011"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceA);
        var foreignCash = await CreateAccountAsync(workspaceB, "1000", "Foreign", "Asset");
        var entryId = await CreateEntryAsync(workspaceA, "Mutate lines");

        var add = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 10m, credit = 0m, description = "Old" });
        using var addDoc = JsonDocument.Parse(await add.Content.ReadAsStringAsync());
        var lineId = addDoc.RootElement.GetProperty("lines")[0].GetProperty("id").GetGuid();

        var update = await _client.PutAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines/{lineId}",
            new { financialAccountId = revenue, debit = 0m, credit = 25.5m, description = "New" });
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        using var updateDoc = JsonDocument.Parse(await update.Content.ReadAsStringAsync());
        var line = updateDoc.RootElement.GetProperty("lines")[0];
        Assert.Equal(revenue, line.GetProperty("financialAccountId").GetGuid());
        Assert.Equal(0m, line.GetProperty("debit").GetDecimal());
        Assert.Equal(25.5m, line.GetProperty("credit").GetDecimal());
        Assert.Equal("New", line.GetProperty("description").GetString());

        var missingLine = await _client.PutAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines/{Guid.NewGuid()}",
            new { financialAccountId = cash, debit = 1m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, missingLine.StatusCode);

        var invalidAmounts = await _client.PutAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines/{lineId}",
            new { financialAccountId = cash, debit = 0m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.BadRequest, invalidAmounts.StatusCode);

        var foreign = await _client.PutAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines/{lineId}",
            new { financialAccountId = foreignCash, debit = 1m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);

        var remove = await _client.DeleteAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines/{lineId}");
        Assert.Equal(HttpStatusCode.OK, remove.StatusCode);
        using var removeDoc = JsonDocument.Parse(await remove.Content.ReadAsStringAsync());
        Assert.Equal(0, removeDoc.RootElement.GetProperty("lines").GetArrayLength());

        var removeMissing = await _client.DeleteAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{entryId}/lines/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.Conflict, removeMissing.StatusCode);

        var wrongWorkspace = await _client.DeleteAsync(
            $"/api/finance-workspaces/{workspaceB}/journal-entries/{entryId}/lines/{lineId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);
    }

    [Fact]
    public async Task Update_and_remove_on_posted_return_conflict()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000012"),
            Guid.Parse("a2000000-0000-0000-0000-000000000012"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);
        var entryId = await CreateBalancedPostedAsync(workspaceId, cash, revenue);

        var get = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}");
        using var getDoc = JsonDocument.Parse(await get.Content.ReadAsStringAsync());
        var lineId = getDoc.RootElement.GetProperty("lines")[0].GetProperty("id").GetGuid();

        var update = await _client.PutAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines/{lineId}",
            new { financialAccountId = cash, debit = 50m, credit = 0m, description = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, update.StatusCode);

        var remove = await _client.DeleteAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines/{lineId}");
        Assert.Equal(HttpStatusCode.Conflict, remove.StatusCode);
    }

    [Fact]
    public async Task Post_balanced_empty_unbalanced_and_repeat()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000013"),
            Guid.Parse("a2000000-0000-0000-0000-000000000013"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000013"),
            Guid.Parse("b2000000-0000-0000-0000-000000000013"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceA);

        var emptyId = await CreateEntryAsync(workspaceA, "Empty");
        var emptyPost = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{emptyId}/post",
            null);
        Assert.Equal(HttpStatusCode.Conflict, emptyPost.StatusCode);

        var unbalancedId = await CreateEntryAsync(workspaceA, "Unbalanced");
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{unbalancedId}/lines",
            new { financialAccountId = cash, debit = 10m, credit = 0m, description = (string?)null });
        var unbalancedPost = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{unbalancedId}/post",
            null);
        Assert.Equal(HttpStatusCode.Conflict, unbalancedPost.StatusCode);

        var balancedId = await CreateEntryAsync(workspaceA, "Balanced");
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{balancedId}/lines",
            new { financialAccountId = cash, debit = 42.75m, credit = 0m, description = (string?)null });
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{balancedId}/lines",
            new { financialAccountId = revenue, debit = 0m, credit = 42.75m, description = (string?)null });

        var post = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{balancedId}/post",
            null);
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        using var postDoc = JsonDocument.Parse(await post.Content.ReadAsStringAsync());
        Assert.Equal("Posted", postDoc.RootElement.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, postDoc.RootElement.GetProperty("postedAtUtc").ValueKind);
        Assert.Equal(42.75m, postDoc.RootElement.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(42.75m, postDoc.RootElement.GetProperty("totalCredit").GetDecimal());

        var repeat = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceA}/journal-entries/{balancedId}/post",
            null);
        Assert.Equal(HttpStatusCode.Conflict, repeat.StatusCode);

        var wrongWorkspace = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceB}/journal-entries/{balancedId}/post",
            null);
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);
    }

    [Fact]
    public async Task Full_http_round_trip_persists_posted_entry()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000014"),
            Guid.Parse("a2000000-0000-0000-0000-000000000014"));
        var (cash, revenue) = await CreateCashAndRevenueAsync(workspaceId);

        var create = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries",
            new { name = "Sale" });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var createDoc = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        var entryId = createDoc.RootElement.GetProperty("id").GetGuid();

        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 99.99m, credit = 0m, description = "Cash in" });
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = revenue, debit = 0m, credit = 99.99m, description = "Sale" });

        var beforePost = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}");
        Assert.Equal(HttpStatusCode.OK, beforePost.StatusCode);
        using var beforeDoc = JsonDocument.Parse(await beforePost.Content.ReadAsStringAsync());
        Assert.Equal("Draft", beforeDoc.RootElement.GetProperty("status").GetString());
        Assert.Equal(2, beforeDoc.RootElement.GetProperty("lines").GetArrayLength());

        var post = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/post",
            null);
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);

        var afterPost = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}");
        Assert.Equal(HttpStatusCode.OK, afterPost.StatusCode);
        using var afterDoc = JsonDocument.Parse(await afterPost.Content.ReadAsStringAsync());
        Assert.Equal("Posted", afterDoc.RootElement.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, afterDoc.RootElement.GetProperty("postedAtUtc").ValueKind);
        Assert.Equal(99.99m, afterDoc.RootElement.GetProperty("totalDebit").GetDecimal());
        Assert.Equal(99.99m, afterDoc.RootElement.GetProperty("totalCredit").GetDecimal());
        Assert.Equal(2, afterDoc.RootElement.GetProperty("lines").GetArrayLength());
        Assert.Equal(99.99m, afterDoc.RootElement.GetProperty("lines")[0].GetProperty("debit").GetDecimal()
            + afterDoc.RootElement.GetProperty("lines")[1].GetProperty("debit").GetDecimal());
    }

    [Fact]
    public async Task Swagger_document_includes_journal_entry_paths()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/journal-entries", json);
        Assert.Contains("CreateJournalEntry", json);
        Assert.Contains("PostJournalEntry", json);
    }

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Journal Workspace",
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

    private async Task<Guid> CreateBalancedPostedAsync(Guid workspaceId, Guid cash, Guid revenue)
    {
        var entryId = await CreateEntryAsync(workspaceId, "Balanced posted");
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = cash, debit = 100m, credit = 0m, description = (string?)null });
        await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/lines",
            new { financialAccountId = revenue, debit = 0m, credit = 100m, description = (string?)null });
        var post = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/journal-entries/{entryId}/post",
            null);
        Assert.Equal(HttpStatusCode.OK, post.StatusCode);
        return entryId;
    }

    private static async Task AssertErrorAsync(HttpResponseMessage response, string error)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(error, document.RootElement.GetProperty("error").GetString());
    }
}
