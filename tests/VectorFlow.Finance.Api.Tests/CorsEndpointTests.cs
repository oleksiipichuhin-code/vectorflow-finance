using System.Net;
using System.Net.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class CorsEndpointTests : IAsyncLifetime
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
    public async Task Health_from_vite_origin_includes_cors_allow_origin()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.TryAddWithoutValidation("Origin", "http://localhost:5173");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values));
        Assert.Equal("http://localhost:5173", Assert.Single(values));
    }

    [Fact]
    public async Task Preflight_from_vite_origin_allows_get()
    {
        using var request = new HttpRequestMessage(HttpMethod.Options, "/health");
        request.Headers.TryAddWithoutValidation("Origin", "http://localhost:5173");
        request.Headers.TryAddWithoutValidation("Access-Control-Request-Method", "GET");

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Origin", out var originValues));
        Assert.Equal("http://localhost:5173", Assert.Single(originValues));
        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Methods", out var methodValues));
        Assert.Contains("GET", string.Join(',', methodValues), StringComparison.OrdinalIgnoreCase);
    }
}
