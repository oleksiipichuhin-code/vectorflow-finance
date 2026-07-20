using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class AccrualEndpointTests : IAsyncLifetime
{
    private static readonly DateTimeOffset RecognitionDate =
        new(2026, 7, 31, 0, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset RecognitionDateAlt =
        new(2026, 8, 15, 0, 0, 0, TimeSpan.Zero);

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
    public async Task Create_returns_201_and_draft_accrual_dto()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000001"),
            Guid.Parse("a2000000-0000-0000-0000-000000000001"));
        var sourceInvoiceId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type = "revenue",
                amount = 125.50m,
                currency = "uah",
                recognitionDateUtc = RecognitionDate,
                description = "  July revenue  ",
                sourceInvoiceId
            });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.NotEqual(Guid.Empty, root.GetProperty("id").GetGuid());
        Assert.Equal(workspaceId, root.GetProperty("financeWorkspaceId").GetGuid());
        Assert.Equal("Revenue", root.GetProperty("type").GetString());
        Assert.Equal(125.50m, root.GetProperty("amount").GetDecimal());
        Assert.Equal("UAH", root.GetProperty("currency").GetString());
        Assert.Equal(RecognitionDate, root.GetProperty("recognitionDateUtc").GetDateTimeOffset());
        Assert.Equal("July revenue", root.GetProperty("description").GetString());
        Assert.Equal(sourceInvoiceId, root.GetProperty("sourceInvoiceId").GetGuid());
        Assert.Equal("Draft", root.GetProperty("status").GetString());
        Assert.True(root.TryGetProperty("createdAtUtc", out _));
        Assert.True(root.TryGetProperty("updatedAtUtc", out _));
        Assert.Equal(JsonValueKind.Null, root.GetProperty("recognizedAtUtc").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("reversedAtUtc").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("reversalReason").ValueKind);
    }

    [Fact]
    public async Task List_returns_only_requested_workspace_newest_first()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000030"),
            Guid.Parse("a2000000-0000-0000-0000-000000000030"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000030"),
            Guid.Parse("b2000000-0000-0000-0000-000000000030"));

        var older = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "Older");
        await Task.Delay(20);
        var newer = await CreateAccrualAsync(workspaceA, "Expense", 20m, "Newer", Guid.Parse("dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb"));
        await CreateAccrualAsync(workspaceB, "Revenue", 30m, "Other");

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceA}/accruals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetArrayLength());
        Assert.Equal(newer, document.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(older, document.RootElement[1].GetProperty("id").GetGuid());
        Assert.Equal("Newer", document.RootElement[0].GetProperty("description").GetString());
        Assert.Equal("Expense", document.RootElement[0].GetProperty("type").GetString());
        Assert.Equal(
            Guid.Parse("dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb"),
            document.RootElement[0].GetProperty("sourceInvoiceId").GetGuid());
        Assert.Equal(JsonValueKind.Null, document.RootElement[1].GetProperty("sourceInvoiceId").ValueKind);
        Assert.True(document.RootElement[0].TryGetProperty("createdAtUtc", out _));
    }

    [Fact]
    public async Task List_empty_workspace_returns_empty_array()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000031"),
            Guid.Parse("a2000000-0000-0000-0000-000000000031"));

        var response = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/accruals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task List_empty_finance_workspace_id_returns_400()
    {
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{Guid.Empty}/accruals");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Get_by_id_still_resolves_after_list_route()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000032"),
            Guid.Parse("a2000000-0000-0000-0000-000000000032"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Get after list");

        var list = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/accruals");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(accrualId, document.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("Get after list", document.RootElement.GetProperty("description").GetString());
    }

    [Fact]
    public async Task List_by_invoice_returns_matching_accruals_newest_first()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000040"),
            Guid.Parse("a2000000-0000-0000-0000-000000000040"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000040"),
            Guid.Parse("b2000000-0000-0000-0000-000000000040"));
        var invoiceId = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        var otherInvoiceId = Guid.Parse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff");

        var older = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "Older", invoiceId);
        await Task.Delay(20);
        var newer = await CreateAccrualAsync(workspaceA, "Expense", 20m, "Newer", invoiceId);
        await CreateAccrualAsync(workspaceA, "Revenue", 30m, "Other invoice", otherInvoiceId);
        await CreateAccrualAsync(workspaceA, "Expense", 40m, "Null source");
        await CreateAccrualAsync(workspaceB, "Revenue", 50m, "Other workspace", invoiceId);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/by-invoice/{invoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, document.RootElement.ValueKind);
        Assert.Equal(2, document.RootElement.GetArrayLength());
        Assert.Equal(newer, document.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(older, document.RootElement[1].GetProperty("id").GetGuid());
        Assert.Equal("Newer", document.RootElement[0].GetProperty("description").GetString());
        Assert.Equal(invoiceId, document.RootElement[0].GetProperty("sourceInvoiceId").GetGuid());
        Assert.Equal(invoiceId, document.RootElement[1].GetProperty("sourceInvoiceId").GetGuid());
        Assert.True(document.RootElement[0].TryGetProperty("createdAtUtc", out _));
        Assert.True(document.RootElement[0].TryGetProperty("type", out _));
        Assert.True(document.RootElement[0].TryGetProperty("amount", out _));
    }

    [Fact]
    public async Task List_by_invoice_empty_returns_200_with_empty_array()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000041"),
            Guid.Parse("a2000000-0000-0000-0000-000000000041"));
        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Null source");
        var unknownInvoiceId = Guid.Parse("cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/by-invoice/{unknownInvoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, document.RootElement.ValueKind);
        Assert.Equal(0, document.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task List_by_invoice_unknown_invoice_id_returns_200_empty_without_invoice_row()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000042"),
            Guid.Parse("a2000000-0000-0000-0000-000000000042"));
        var unknownInvoiceId = Guid.NewGuid();

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/by-invoice/{unknownInvoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task List_by_invoice_empty_finance_workspace_id_returns_400()
    {
        var invoiceId = Guid.Parse("dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{Guid.Empty}/accruals/by-invoice/{invoiceId}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_by_invoice_empty_invoice_id_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000043"),
            Guid.Parse("a2000000-0000-0000-0000-000000000043"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/by-invoice/{Guid.Empty}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_and_get_by_id_still_resolve_after_by_invoice_route()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000044"),
            Guid.Parse("a2000000-0000-0000-0000-000000000044"));
        var invoiceId = Guid.Parse("eeeeeeee-ffff-aaaa-bbbb-cccccccccccc");
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 40m, "After by-invoice", invoiceId);

        var byInvoice = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/by-invoice/{invoiceId}");
        Assert.Equal(HttpStatusCode.OK, byInvoice.StatusCode);

        var list = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/accruals");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var listDocument = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(1, listDocument.RootElement.GetArrayLength());

        var get = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        using var getDocument = JsonDocument.Parse(await get.Content.ReadAsStringAsync());
        Assert.Equal(accrualId, getDocument.RootElement.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Create_missing_workspace_returns_404()
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{Guid.NewGuid()}/accruals",
            ValidCreateBody());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await AssertErrorAsync(response, "NotFound");
    }

    [Fact]
    public async Task Create_invalid_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000002"),
            Guid.Parse("a2000000-0000-0000-0000-000000000002"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type = "Tax",
                amount = 10m,
                currency = "UAH",
                recognitionDateUtc = RecognitionDate,
                description = "Bad type",
                sourceInvoiceId = (Guid?)null
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Create_non_positive_amount_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000003"),
            Guid.Parse("a2000000-0000-0000-0000-000000000003"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type = "Expense",
                amount = 0m,
                currency = "UAH",
                recognitionDateUtc = RecognitionDate,
                description = "Zero",
                sourceInvoiceId = (Guid?)null
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Create_blank_description_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000004"),
            Guid.Parse("a2000000-0000-0000-0000-000000000004"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type = "Revenue",
                amount = 10m,
                currency = "UAH",
                recognitionDateUtc = RecognitionDate,
                description = "   ",
                sourceInvoiceId = (Guid?)null
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Create_blank_currency_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000005"),
            Guid.Parse("a2000000-0000-0000-0000-000000000005"));

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type = "Revenue",
                amount = 10m,
                currency = "   ",
                recognitionDateUtc = RecognitionDate,
                description = "Blank currency",
                sourceInvoiceId = (Guid?)null
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Get_by_id_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000006"),
            Guid.Parse("a2000000-0000-0000-0000-000000000006"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Get me");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(accrualId, document.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("Get me", document.RootElement.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Get_missing_and_cross_workspace_return_404()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000007"),
            Guid.Parse("a2000000-0000-0000-0000-000000000007"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000007"),
            Guid.Parse("b2000000-0000-0000-0000-000000000007"));
        var accrualId = await CreateAccrualAsync(workspaceA, "Expense", 15m, "Scoped");

        var missing = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var wrongWorkspace = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceB}/accruals/{accrualId}");
        Assert.Equal(HttpStatusCode.NotFound, wrongWorkspace.StatusCode);
        await AssertErrorAsync(wrongWorkspace, "NotFound");
    }

    [Fact]
    public async Task Change_type_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000008"),
            Guid.Parse("a2000000-0000-0000-0000-000000000008"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Type");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-type",
            new { type = "Expense" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Expense", document.RootElement.GetProperty("type").GetString());
        Assert.Equal("Draft", document.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Change_type_invalid_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000009"),
            Guid.Parse("a2000000-0000-0000-0000-000000000009"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Bad type");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-type",
            new { type = "Payroll" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Change_amount_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000010"),
            Guid.Parse("a2000000-0000-0000-0000-000000000010"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Amount");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-amount",
            new { amount = 99.99m });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(99.99m, document.RootElement.GetProperty("amount").GetDecimal());
    }

    [Fact]
    public async Task Change_amount_invalid_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000011"),
            Guid.Parse("a2000000-0000-0000-0000-000000000011"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Bad amount");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-amount",
            new { amount = -1m });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Change_currency_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000012"),
            Guid.Parse("a2000000-0000-0000-0000-000000000012"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Currency");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-currency",
            new { currency = "usd" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("USD", document.RootElement.GetProperty("currency").GetString());
    }

    [Fact]
    public async Task Change_currency_blank_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000013"),
            Guid.Parse("a2000000-0000-0000-0000-000000000013"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Blank currency");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-currency",
            new { currency = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Change_recognition_date_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000014"),
            Guid.Parse("a2000000-0000-0000-0000-000000000014"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Date");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-recognition-date",
            new { recognitionDateUtc = RecognitionDateAlt });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(
            RecognitionDateAlt,
            document.RootElement.GetProperty("recognitionDateUtc").GetDateTimeOffset());
    }

    [Fact]
    public async Task Change_description_returns_200()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000015"),
            Guid.Parse("a2000000-0000-0000-0000-000000000015"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Old");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-description",
            new { description = "New description" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("New description", document.RootElement.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Change_description_blank_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000016"),
            Guid.Parse("a2000000-0000-0000-0000-000000000016"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Desc");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-description",
            new { description = "  " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Change_source_invoice_set_and_clear_persist()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000017"),
            Guid.Parse("a2000000-0000-0000-0000-000000000017"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Source");
        var sourceInvoiceId = Guid.Parse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff");

        var set = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-source-invoice",
            new { sourceInvoiceId });
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);
        using (var document = JsonDocument.Parse(await set.Content.ReadAsStringAsync()))
        {
            Assert.Equal(sourceInvoiceId, document.RootElement.GetProperty("sourceInvoiceId").GetGuid());
        }

        var clear = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-source-invoice",
            new StringContent("""{"sourceInvoiceId":null}""", Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
        using (var document = JsonDocument.Parse(await clear.Content.ReadAsStringAsync()))
        {
            Assert.Equal(JsonValueKind.Null, document.RootElement.GetProperty("sourceInvoiceId").ValueKind);
        }
    }

    [Fact]
    public async Task Change_source_invoice_empty_guid_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000018"),
            Guid.Parse("a2000000-0000-0000-0000-000000000018"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Empty source");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-source-invoice",
            new { sourceInvoiceId = Guid.Empty });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Change_source_invoice_nonexistent_id_is_accepted()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000019"),
            Guid.Parse("a2000000-0000-0000-0000-000000000019"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "No FK");
        var fakeInvoiceId = Guid.Parse("cccccccc-dddd-eeee-ffff-111111111111");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-source-invoice",
            new { sourceInvoiceId = fakeInvoiceId });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(fakeInvoiceId, document.RootElement.GetProperty("sourceInvoiceId").GetGuid());
    }

    [Fact]
    public async Task Recognize_returns_200_with_status_and_recognizedAtUtc()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000020"),
            Guid.Parse("a2000000-0000-0000-0000-000000000020"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Recognize");

        var response = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/recognize",
            null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal("Recognized", root.GetProperty("status").GetString());
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("recognizedAtUtc").ValueKind);
        Assert.Equal(JsonValueKind.Null, root.GetProperty("reversedAtUtc").ValueKind);
    }

    [Fact]
    public async Task Reverse_returns_200_and_preserves_recognizedAtUtc()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000021"),
            Guid.Parse("a2000000-0000-0000-0000-000000000021"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Expense", 60m, "Reverse");

        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);
        using var recognizedDoc = JsonDocument.Parse(await recognize.Content.ReadAsStringAsync());
        var recognizedAt = recognizedDoc.RootElement.GetProperty("recognizedAtUtc").GetDateTimeOffset();

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/reverse",
            new { reason = "  Correction required  " });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal("Reversed", root.GetProperty("status").GetString());
        Assert.Equal(recognizedAt, root.GetProperty("recognizedAtUtc").GetDateTimeOffset());
        Assert.NotEqual(JsonValueKind.Null, root.GetProperty("reversedAtUtc").ValueKind);
        Assert.Equal("Correction required", root.GetProperty("reversalReason").GetString());
    }

    [Fact]
    public async Task Mutation_after_recognize_returns_409()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000022"),
            Guid.Parse("a2000000-0000-0000-0000-000000000022"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 70m, "Locked");

        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var changeAmount = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/change-amount",
            new { amount = 1m });
        Assert.Equal(HttpStatusCode.Conflict, changeAmount.StatusCode);
        await AssertErrorAsync(changeAmount, "Conflict");
    }

    [Fact]
    public async Task Reverse_from_draft_returns_409()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000023"),
            Guid.Parse("a2000000-0000-0000-0000-000000000023"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 80m, "Draft reverse");

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/reverse",
            new { reason = "Too early" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        await AssertErrorAsync(response, "Conflict");
    }

    [Fact]
    public async Task Reverse_blank_reason_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000024"),
            Guid.Parse("a2000000-0000-0000-0000-000000000024"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 90m, "Blank reason");

        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/reverse",
            new { reason = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task Recognize_twice_returns_409()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000025"),
            Guid.Parse("a2000000-0000-0000-0000-000000000025"));
        var accrualId = await CreateAccrualAsync(workspaceId, "Expense", 55m, "Twice");

        var first = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{accrualId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        await AssertErrorAsync(second, "Conflict");
    }

    [Fact]
    public async Task Swagger_includes_accrual_routes_including_list_and_by_invoice()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("/api/finance-workspaces/{financeWorkspaceId}/accruals", json);
        Assert.Contains(
            "/api/finance-workspaces/{financeWorkspaceId}/accruals/by-invoice/{invoiceId}",
            json);
        Assert.Contains("CreateAccrual", json);
        Assert.Contains("ListAccruals", json);
        Assert.Contains("ListAccrualsByInvoice", json);
        Assert.Contains("GetAccrualById", json);
        Assert.Contains("RecognizeAccrual", json);
        Assert.Contains("ReverseAccrual", json);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "\"ListAccruals\""));
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "\"ListAccrualsByInvoice\""));
    }

    private static object ValidCreateBody() => new
    {
        type = "Revenue",
        amount = 10m,
        currency = "UAH",
        recognitionDateUtc = RecognitionDate,
        description = "Valid",
        sourceInvoiceId = (Guid?)null
    };

    private async Task<Guid> CreateWorkspaceAsync(Guid organizationId, Guid platformWorkspaceId)
    {
        var createResponse = await _client.PostAsJsonAsync("/api/finance-workspaces", new
        {
            platformOrganizationId = organizationId,
            platformWorkspaceId,
            name = "Accrual Workspace",
            defaultCurrency = "UAH"
        });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var document = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<Guid> CreateAccrualAsync(
        Guid workspaceId,
        string type,
        decimal amount,
        string description,
        Guid? sourceInvoiceId = null)
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type,
                amount,
                currency = "UAH",
                recognitionDateUtc = RecognitionDate,
                description,
                sourceInvoiceId
            });
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
