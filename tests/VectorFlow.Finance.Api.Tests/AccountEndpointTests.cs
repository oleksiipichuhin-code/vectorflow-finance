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

public sealed class AccountEndpointTests : IAsyncLifetime
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
    public async Task Create_then_get_by_id_and_code_succeeds()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"));

        var createResponse = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            new
            {
                code = " 1000 ",
                name = "  Operating Cash  ",
                type = "asset"
            });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var created = createdDocument.RootElement;
        var accountId = created.GetProperty("id").GetGuid();

        Assert.Equal(workspaceId, created.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal("1000", created.GetProperty("code").GetString());
        Assert.Equal("Operating Cash", created.GetProperty("name").GetString());
        Assert.Equal("Asset", created.GetProperty("type").GetString());
        Assert.Equal("Active", created.GetProperty("status").GetString());

        var getById = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}");
        Assert.Equal(HttpStatusCode.OK, getById.StatusCode);

        var getByCode = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/by-code?code=1000");
        Assert.Equal(HttpStatusCode.OK, getByCode.StatusCode);

        using var byCodeDocument = JsonDocument.Parse(await getByCode.Content.ReadAsStringAsync());
        Assert.Equal(accountId, byCodeDocument.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("1000", byCodeDocument.RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Create_duplicate_code_returns_conflict()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd"));

        var payload = new { code = "1000", name = "Cash", type = "Asset" };

        var first = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            payload);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            payload);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        using var document = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        Assert.Equal("Conflict", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Get_missing_account_returns_not_found()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("NotFound", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Get_wrong_workspace_returns_not_found()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            Guid.Parse("44444444-4444-4444-4444-444444444444"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("55555555-5555-5555-5555-555555555555"),
            Guid.Parse("66666666-6666-6666-6666-666666666666"));

        var createResponse = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/accounts",
            new { code = "1000", name = "Cash", type = "Asset" });
        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var accountId = createdDocument.RootElement.GetProperty("id").GetGuid();

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/accounts/{accountId}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("NotFound", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Rename_change_code_change_type_and_archive_succeed()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("77777777-7777-7777-7777-777777777777"),
            Guid.Parse("88888888-8888-8888-8888-888888888888"));

        var createResponse = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            new { code = "1000", name = "Cash", type = "Asset" });
        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var accountId = createdDocument.RootElement.GetProperty("id").GetGuid();

        var rename = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/rename",
            new { name = "Petty Cash" });
        Assert.Equal(HttpStatusCode.OK, rename.StatusCode);

        var changeCode = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/change-code",
            new { code = "1100" });
        Assert.Equal(HttpStatusCode.OK, changeCode.StatusCode);

        var changeType = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/change-type",
            new { type = "expense" });
        Assert.Equal(HttpStatusCode.OK, changeType.StatusCode);

        var archive = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/archive",
            null);
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);

        using var archivedDocument = JsonDocument.Parse(await archive.Content.ReadAsStringAsync());
        Assert.Equal("Petty Cash", archivedDocument.RootElement.GetProperty("name").GetString());
        Assert.Equal("1100", archivedDocument.RootElement.GetProperty("code").GetString());
        Assert.Equal("Expense", archivedDocument.RootElement.GetProperty("type").GetString());
        Assert.Equal("Archived", archivedDocument.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Create_with_blank_name_returns_bad_request()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("99999999-9999-9999-9999-999999999999"),
            Guid.Parse("abababab-abab-abab-abab-abababababab"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            new { code = "1000", name = "   ", type = "Asset" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ValidationFailed", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Get_by_code_without_code_returns_bad_request()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd"),
            Guid.Parse("efefefef-efef-efef-efef-efefefefefef"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/by-code");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ValidationFailed", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Create_for_missing_workspace_returns_not_found()
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{Guid.NewGuid()}/accounts",
            new { code = "1000", name = "Cash", type = "Asset" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("NotFound", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Archive_then_rename_returns_conflict()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("12121212-1212-1212-1212-121212121212"),
            Guid.Parse("34343434-3434-3434-3434-343434343434"));

        var createResponse = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts",
            new { code = "1000", name = "Cash", type = "Asset" });
        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var accountId = createdDocument.RootElement.GetProperty("id").GetGuid();

        var archive = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/archive",
            null);
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);

        var rename = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accounts/{accountId}/rename",
            new { name = "Nope" });

        Assert.Equal(HttpStatusCode.Conflict, rename.StatusCode);
        using var document = JsonDocument.Parse(await rename.Content.ReadAsStringAsync());
        Assert.Equal("Conflict", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Same_code_allowed_in_different_workspaces()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("56565656-5656-5656-5656-565656565656"),
            Guid.Parse("78787878-7878-7878-7878-787878787878"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("90909090-9090-9090-9090-909090909090"),
            Guid.Parse("a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1"));

        var first = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceA}/accounts",
            new { code = "1000", name = "Cash A", type = "Asset" });
        var second = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceB}/accounts",
            new { code = "1000", name = "Cash B", type = "Asset" });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
    }

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Accounts Workspace",
            defaultCurrency = "UAH"
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        using var document = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }
}
