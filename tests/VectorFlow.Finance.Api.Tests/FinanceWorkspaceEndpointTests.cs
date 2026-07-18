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

public sealed class FinanceWorkspaceEndpointTests : IAsyncLifetime
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
    public async Task Create_then_get_by_id_and_platform_scope_succeeds()
    {
        var organizationId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var platformWorkspaceId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "  Ops Finance  ",
            defaultCurrency = "uah"
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var created = createdDocument.RootElement;
        var id = created.GetProperty("id").GetGuid();

        Assert.Equal("Ops Finance", created.GetProperty("name").GetString());
        Assert.Equal("UAH", created.GetProperty("defaultCurrency").GetString());
        Assert.Equal("Active", created.GetProperty("status").GetString());

        var getById = await _client.GetAsync($"/api/finance-workspaces/{id}");
        Assert.Equal(HttpStatusCode.OK, getById.StatusCode);

        var getByScope = await _client.GetAsync(
            $"/api/finance-workspaces?platformOrganizationId={organizationId}&platformWorkspaceId={platformWorkspaceId}");
        Assert.Equal(HttpStatusCode.OK, getByScope.StatusCode);

        using var scopeDocument = JsonDocument.Parse(await getByScope.Content.ReadAsStringAsync());
        Assert.Equal(id, scopeDocument.RootElement.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Create_duplicate_platform_scope_returns_conflict()
    {
        var organizationId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
        var platformWorkspaceId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
        var payload = new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Primary",
            defaultCurrency = "EUR"
        };

        var first = await _client.PostAsJsonAsync("/api/finance-workspaces", payload);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        var second = await _client.PostAsJsonAsync("/api/finance-workspaces", payload);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        using var document = JsonDocument.Parse(await second.Content.ReadAsStringAsync());
        Assert.Equal("Conflict", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Get_missing_workspace_returns_not_found()
    {
        var response = await _client.GetAsync($"/api/finance-workspaces/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("NotFound", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Patch_rename_and_lifecycle_actions_succeed()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = Guid.Parse("eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"),
            platformWorkspaceId = Guid.Parse("ffffffff-ffff-ffff-ffff-ffffffffffff"),
            name = "Lifecycle",
            defaultCurrency = "USD"
        });

        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = createdDocument.RootElement.GetProperty("id").GetGuid();

        var patchResponse = await _client.PatchAsJsonAsync($"/api/finance-workspaces/{id}", new
        {
            name = "Renamed Lifecycle",
            defaultCurrency = "eur"
        });
        Assert.Equal(HttpStatusCode.OK, patchResponse.StatusCode);

        using var patchedDocument = JsonDocument.Parse(await patchResponse.Content.ReadAsStringAsync());
        Assert.Equal("Renamed Lifecycle", patchedDocument.RootElement.GetProperty("name").GetString());
        Assert.Equal("EUR", patchedDocument.RootElement.GetProperty("defaultCurrency").GetString());

        var suspend = await _client.PostAsync($"/api/finance-workspaces/{id}/suspend", null);
        Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);

        var reactivate = await _client.PostAsync($"/api/finance-workspaces/{id}/reactivate", null);
        Assert.Equal(HttpStatusCode.OK, reactivate.StatusCode);

        var archive = await _client.PostAsync($"/api/finance-workspaces/{id}/archive", null);
        Assert.Equal(HttpStatusCode.OK, archive.StatusCode);

        using var archivedDocument = JsonDocument.Parse(await archive.Content.ReadAsStringAsync());
        Assert.Equal("Archived", archivedDocument.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Create_with_blank_name_returns_bad_request()
    {
        var response = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = Guid.NewGuid(),
            platformWorkspaceId = Guid.NewGuid(),
            name = "   ",
            defaultCurrency = "UAH"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ValidationFailed", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Patch_with_empty_body_returns_bad_request()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = Guid.Parse("12121212-1212-1212-1212-121212121212"),
            platformWorkspaceId = Guid.Parse("34343434-3434-3434-3434-343434343434"),
            name = "Patch Empty",
            defaultCurrency = "USD"
        });

        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = createdDocument.RootElement.GetProperty("id").GetGuid();

        var patchResponse = await _client.PatchAsJsonAsync($"/api/finance-workspaces/{id}", new
        {
            name = (string?)null,
            defaultCurrency = (string?)null
        });

        Assert.Equal(HttpStatusCode.BadRequest, patchResponse.StatusCode);

        using var document = JsonDocument.Parse(await patchResponse.Content.ReadAsStringAsync());
        Assert.Equal("ValidationFailed", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Get_by_platform_scope_without_both_parameters_returns_bad_request()
    {
        var response = await _client.GetAsync(
            "/api/finance-workspaces?platformOrganizationId=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("ValidationFailed", document.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Patch_with_valid_name_and_invalid_currency_does_not_partially_apply()
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = Guid.Parse("56565656-5656-5656-5656-565656565656"),
            platformWorkspaceId = Guid.Parse("78787878-7878-7878-7878-787878787878"),
            name = "Original Name",
            defaultCurrency = "USD"
        });

        using var createdDocument = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var id = createdDocument.RootElement.GetProperty("id").GetGuid();

        var suspendResponse = await _client.PostAsync($"/api/finance-workspaces/{id}/suspend", null);
        Assert.Equal(HttpStatusCode.OK, suspendResponse.StatusCode);

        // Suspended workspaces reject currency changes; rename alone would succeed.
        // Atomic PATCH must not persist the rename when currency mutation fails.
        var patchResponse = await _client.PatchAsJsonAsync($"/api/finance-workspaces/{id}", new
        {
            name = "Should Not Persist",
            defaultCurrency = "EUR"
        });

        Assert.Equal(HttpStatusCode.Conflict, patchResponse.StatusCode);

        var getResponse = await _client.GetAsync($"/api/finance-workspaces/{id}");
        Assert.Equal(HttpStatusCode.OK, getResponse.StatusCode);

        using var document = JsonDocument.Parse(await getResponse.Content.ReadAsStringAsync());
        Assert.Equal("Original Name", document.RootElement.GetProperty("name").GetString());
        Assert.Equal("USD", document.RootElement.GetProperty("defaultCurrency").GetString());
        Assert.Equal("Suspended", document.RootElement.GetProperty("status").GetString());
    }
}
