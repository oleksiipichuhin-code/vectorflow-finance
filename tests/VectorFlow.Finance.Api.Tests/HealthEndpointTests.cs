using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public HealthEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Get_health_returns_f0_payload()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;

        Assert.Equal("VectorFlow Finance API", root.GetProperty("product").GetString());
        Assert.Equal("Healthy", root.GetProperty("status").GetString());
        Assert.Equal("F0", root.GetProperty("phase").GetString());
    }
}
