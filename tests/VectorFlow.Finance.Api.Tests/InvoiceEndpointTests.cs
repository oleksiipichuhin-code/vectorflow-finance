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

public sealed class InvoiceEndpointTests : IAsyncLifetime
{
    private static readonly DateTimeOffset FutureDue =
        new(2030, 1, 15, 0, 0, 0, TimeSpan.Zero);

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
    public async Task Create_returns_201_and_draft_invoice_dto()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000001"),
            Guid.Parse("c2000000-0000-0000-0000-000000000001"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices",
            new
            {
                documentNumber = "  INV-001  ",
                counterpartyReference = "  cp-1  ",
                currency = "uah"
            });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.NotEqual(Guid.Empty, root.GetProperty("id").GetGuid());
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal("INV-001", root.GetProperty("documentNumber").GetString());
        Assert.Equal("cp-1", root.GetProperty("counterpartyReference").GetString());
        Assert.Equal("UAH", root.GetProperty("currency").GetString());
        Assert.Equal("Draft", root.GetProperty("status").GetString());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("dueDateUtc").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("issuedAtUtc").ValueKind);
        Assert.Equal(0m, root.GetProperty("totalAmount").GetDecimal());
        Assert.True(root.TryGetProperty("createdAtUtc", out _));
        Assert.True(root.TryGetProperty("updatedAtUtc", out _));
        Assert.Equal(0, root.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Create_missing_workspace_returns_404()
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{Guid.NewGuid()}/invoices",
            new
            {
                documentNumber = "INV-X",
                counterpartyReference = "cp",
                currency = "UAH"
            });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Create_blank_document_number_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000002"),
            Guid.Parse("c2000000-0000-0000-0000-000000000002"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices",
            new
            {
                documentNumber = "   ",
                counterpartyReference = "cp",
                currency = "UAH"
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Get_by_id_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000003"),
            Guid.Parse("c2000000-0000-0000-0000-000000000003"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-GET", "cp-get", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(invoiceId, document.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("INV-GET", document.RootElement.GetProperty("documentNumber").GetString());
        Assert.Equal("USD", document.RootElement.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task Get_missing_and_cross_workspace_return_404()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000004"),
            Guid.Parse("c2000000-0000-0000-0000-000000000004"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000004"),
            Guid.Parse("d2000000-0000-0000-0000-000000000004"));
        var invoiceId = await CreateInvoiceAsync(workspaceA, "INV-SCOPE", "cp-scope", "EUR");

        var missing = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var wrongWorkspace = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/invoices/{invoiceId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);
        await AssertErrorAsync(wrongWorkspace, "NotFound");
    }

    [Fact]
    public async Task Change_document_number_returns_updated_invoice()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000005"),
            Guid.Parse("c2000000-0000-0000-0000-000000000005"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-OLD", "cp", "UAH");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/change-document-number",
            new { documentNumber = "INV-NEW" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("INV-NEW", document.RootElement.GetProperty("documentNumber").GetString());
        Assert.Equal("Draft", document.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Change_counterparty_returns_updated_invoice()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000006"),
            Guid.Parse("c2000000-0000-0000-0000-000000000006"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-CP", "cp-old", "UAH");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/change-counterparty",
            new { counterpartyReference = "cp-new" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("cp-new", document.RootElement.GetProperty("counterpartyReference").GetString());
    }

    [Fact]
    public async Task Change_currency_returns_updated_invoice()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000007"),
            Guid.Parse("c2000000-0000-0000-0000-000000000007"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-CUR", "cp", "UAH");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/change-currency",
            new { currency = "usd" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("USD", document.RootElement.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task Set_due_date_returns_updated_invoice()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000008"),
            Guid.Parse("c2000000-0000-0000-0000-000000000008"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-DUE", "cp", "UAH");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/set-due-date",
            new { dueDateUtc = FutureDue });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(FutureDue, document.RootElement.GetProperty("dueDateUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task Add_line_returns_updated_totals()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000009"),
            Guid.Parse("c2000000-0000-0000-0000-000000000009"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-ADD", "cp", "UAH");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/lines",
            new { quantity = 2m, unitPrice = 10.5m, description = "Widget" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(21m, root.GetProperty("totalAmount").GetDecimal());
        Assert.Equal(1, root.GetProperty("lines").GetArrayLength());
        var line = root.GetProperty("lines")[0];
        Assert.Equal(1, line.GetProperty("sequence").GetInt32());
        Assert.Equal(2m, line.GetProperty("quantity").GetDecimal());
        Assert.Equal(10.5m, line.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(21m, line.GetProperty("lineAmount").GetDecimal());
        Assert.Equal("Widget", line.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Update_line_returns_updated_totals()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000010"),
            Guid.Parse("c2000000-0000-0000-0000-000000000010"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-UPD", "cp", "UAH");
        var lineId = await AddLineAsync(workspaceId, invoiceId, 1m, 10m, "Old");

        var response = await _client.PutAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/lines/{lineId}",
            new { quantity = 3m, unitPrice = 5m, description = "New" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(15m, root.GetProperty("totalAmount").GetDecimal());
        var line = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal(lineId, line.GetProperty("id").GetGuid());
        Assert.Equal(3m, line.GetProperty("quantity").GetDecimal());
        Assert.Equal(5m, line.GetProperty("unitPrice").GetDecimal());
        Assert.Equal(15m, line.GetProperty("lineAmount").GetDecimal());
        Assert.Equal("New", line.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Remove_line_returns_updated_totals()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000011"),
            Guid.Parse("c2000000-0000-0000-0000-000000000011"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-RM", "cp", "UAH");
        var keepId = await AddLineAsync(workspaceId, invoiceId, 1m, 10m, "Keep");
        var removeId = await AddLineAsync(workspaceId, invoiceId, 1m, 5m, "Remove");

        var response = await _client.DeleteAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/lines/{removeId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(10m, root.GetProperty("totalAmount").GetDecimal());
        var remaining = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal(keepId, remaining.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Issue_returns_issued_status_and_issuedAtUtc()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000012"),
            Guid.Parse("c2000000-0000-0000-0000-000000000012"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-ISSUE", "cp", "UAH");
        await AddLineAsync(workspaceId, invoiceId, 2m, 50m, "Service");
        await SetDueDateAsync(workspaceId, invoiceId, FutureDue);

        var response = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/issue",
            null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal("Issued", root.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("issuedAtUtc").ValueKind);
        Assert.Equal(FutureDue, root.GetProperty("dueDateUtc").GetDateTimeOffset());
        Assert.Equal(100m, root.GetProperty("totalAmount").GetDecimal());
        Assert.Equal(1, root.GetProperty("lines").GetArrayLength());
    }

    [Fact]
    public async Task Mutation_after_issue_returns_409()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000013"),
            Guid.Parse("c2000000-0000-0000-0000-000000000013"));
        var invoiceId = await CreateIssuableInvoiceAsync(workspaceId);

        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var rename = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/change-document-number",
            new { documentNumber = "NOPE" });
        Assert.Equal(HttpStatusCode.Conflict, rename.StatusCode);
        await AssertErrorAsync(rename, "Conflict");

        var addLine = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/lines",
            new { quantity = 1m, unitPrice = 1m, description = (string?)null });
        Assert.Equal(HttpStatusCode.Conflict, addLine.StatusCode);
    }

    [Fact]
    public async Task Swagger_includes_invoice_routes()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/invoices", json);
        Assert.Contains("CreateInvoice", json);
        Assert.Contains("IssueInvoice", json);
    }

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Invoice Workspace",
            defaultCurrency = "UAH"
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var document = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<Guid> CreateInvoiceAsync(
        Guid workspaceId,
        string documentNumber,
        string counterpartyReference,
        string currency)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices",
            new
            {
                documentNumber,
                counterpartyReference,
                currency
            });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<Guid> AddLineAsync(
        Guid workspaceId,
        Guid invoiceId,
        decimal quantity,
        decimal unitPrice,
        string? description)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/lines",
            new { quantity, unitPrice, description });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var lines = document.RootElement.GetProperty("lines");
        return lines[lines.GetArrayLength() - 1].GetProperty("id").GetGuid();
    }

    private async Task SetDueDateAsync(Guid workspaceId, Guid invoiceId, DateTimeOffset dueDateUtc)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}/set-due-date",
            new { dueDateUtc });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private async Task<Guid> CreateIssuableInvoiceAsync(Guid workspaceId)
    {
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-READY", "cp", "UAH");
        await AddLineAsync(workspaceId, invoiceId, 1m, 25m, "Ready");
        await SetDueDateAsync(workspaceId, invoiceId, FutureDue);
        return invoiceId;
    }

    private static async Task AssertErrorAsync(HttpResponseMessage response, string error)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(error, document.RootElement.GetProperty("error").GetString());
    }
}
