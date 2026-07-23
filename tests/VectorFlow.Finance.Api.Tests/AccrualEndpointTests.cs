using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using Xunit;

namespace VectorFlow.Finance.Api.Tests;

public sealed class AccrualEndpointTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 20, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 20, 11, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);

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
    public async Task ListPaged_returns_only_requested_workspace_newest_first()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000050"),
            Guid.Parse("a2000000-0000-0000-0000-000000000050"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000050"),
            Guid.Parse("b2000000-0000-0000-0000-000000000050"));

        var older = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "Older");
        await Task.Delay(20);
        var newer = await CreateAccrualAsync(workspaceA, "Expense", 20m, "Newer");
        await CreateAccrualAsync(workspaceB, "Revenue", 30m, "Other");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(1, root.GetProperty("page").GetInt32());
        Assert.Equal(10, root.GetProperty("pageSize").GetInt32());
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var items = root.GetProperty("items");
        Assert.Equal(2, items.GetArrayLength());
        Assert.Equal(newer, items[0].GetProperty("id").GetGuid());
        Assert.Equal(older, items[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_empty_workspace_returns_empty_items()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000051"),
            Guid.Parse("a2000000-0000-0000-0000-000000000051"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(1, document.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(20, document.RootElement.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task ListPaged_multiple_pages_preserve_order_and_total()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000052"),
            Guid.Parse("a2000000-0000-0000-0000-000000000052"));

        var first = await CreateAccrualAsync(workspaceId, "Revenue", 1m, "1");
        await Task.Delay(20);
        var second = await CreateAccrualAsync(workspaceId, "Revenue", 2m, "2");
        await Task.Delay(20);
        var third = await CreateAccrualAsync(workspaceId, "Revenue", 3m, "3");

        var page1Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=2");
        var page2Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=2&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page1Response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, page2Response.StatusCode);

        using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
        using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
        Assert.Equal(3, page1.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(3, page2.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(third, page1.RootElement.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal(second, page1.RootElement.GetProperty("items")[1].GetProperty("id").GetGuid());
        Assert.Equal(first, page2.RootElement.GetProperty("items")[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_invalid_page_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000053"),
            Guid.Parse("a2000000-0000-0000-0000-000000000053"));

        var zero = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=0&pageSize=10");
        var negative = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=-1&pageSize=10");

        Assert.Equal(HttpStatusCode.BadRequest, zero.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, negative.StatusCode);
        await AssertErrorAsync(zero, "ValidationFailed");
        await AssertErrorAsync(negative, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_invalid_page_size_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000054"),
            Guid.Parse("a2000000-0000-0000-0000-000000000054"));

        var zero = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=0");
        var over = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=101");

        Assert.Equal(HttpStatusCode.BadRequest, zero.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, over.StatusCode);
        await AssertErrorAsync(zero, "ValidationFailed");
        await AssertErrorAsync(over, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_page_size_100_is_accepted()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000055"),
            Guid.Parse("a2000000-0000-0000-0000-000000000055"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=100");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(100, document.RootElement.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task ListPaged_does_not_break_existing_list_or_by_invoice_routes()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000056"),
            Guid.Parse("a2000000-0000-0000-0000-000000000056"));
        var invoiceId = Guid.Parse("cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa");
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Keep", invoiceId);

        var list = await _client.GetAsync($"/api/finance-workspaces/{workspaceId}/accruals");
        var byInvoice = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/by-invoice/{invoiceId}");
        var paged = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");

        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal(HttpStatusCode.OK, byInvoice.StatusCode);
        Assert.Equal(HttpStatusCode.OK, paged.StatusCode);

        using var listDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        using var byInvoiceDoc = JsonDocument.Parse(await byInvoice.Content.ReadAsStringAsync());
        using var pagedDoc = JsonDocument.Parse(await paged.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, listDoc.RootElement.ValueKind);
        Assert.Equal(JsonValueKind.Array, byInvoiceDoc.RootElement.ValueKind);
        Assert.Equal(accrualId, listDoc.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(accrualId, byInvoiceDoc.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(accrualId, pagedDoc.RootElement.GetProperty("items")[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_status_Draft_returns_only_drafts()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000070"),
            Guid.Parse("a2000000-0000-0000-0000-000000000070"));

        var draftId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        var recognizedId = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Recognized");
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{recognizedId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(draftId, item.GetProperty("id").GetGuid());
        Assert.Equal("Draft", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ListPaged_status_Recognized_returns_only_recognized()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000071"),
            Guid.Parse("a2000000-0000-0000-0000-000000000071"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        var recognizedId = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Recognized");
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{recognizedId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Recognized");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(recognizedId, item.GetProperty("id").GetGuid());
        Assert.Equal("Recognized", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ListPaged_status_Reversed_returns_only_reversed()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000072"),
            Guid.Parse("a2000000-0000-0000-0000-000000000072"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        var reversedId = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Reversed");
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{reversedId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);
        var reverse = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{reversedId}/reverse",
            new { reason = "Correction" });
        Assert.Equal(HttpStatusCode.OK, reverse.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Reversed");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(reversedId, item.GetProperty("id").GetGuid());
        Assert.Equal("Reversed", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ListPaged_omitted_status_returns_all_statuses()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000073"),
            Guid.Parse("a2000000-0000-0000-0000-000000000073"));

        var draftId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        var recognizedId = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Recognized");
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{recognizedId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var ids = document.RootElement.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToHashSet();
        Assert.Contains(draftId, ids);
        Assert.Contains(recognizedId, ids);
    }

    [Fact]
    public async Task ListPaged_explicit_blank_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000074"),
            Guid.Parse("a2000000-0000-0000-0000-000000000074"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_whitespace_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000075"),
            Guid.Parse("a2000000-0000-0000-0000-000000000075"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=%20%20%20");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_lowercase_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000076"),
            Guid.Parse("a2000000-0000-0000-0000-000000000076"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=draft");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_unknown_status_Paid_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000077"),
            Guid.Parse("a2000000-0000-0000-0000-000000000077"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Paid");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_numeric_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000078"),
            Guid.Parse("a2000000-0000-0000-0000-000000000078"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_status_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000079"),
            Guid.Parse("a2000000-0000-0000-0000-000000000079"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft only");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Recognized");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_status_filter_pages_within_filtered_set()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000080"),
            Guid.Parse("a2000000-0000-0000-0000-000000000080"));

        var draft1 = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft 1");
        await Task.Delay(20);
        var draft2 = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Draft 2");
        await Task.Delay(20);
        var recognizedId = await CreateAccrualAsync(workspaceId, "Expense", 30m, "Recognized");
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{recognizedId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var page1Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=1&status=Draft");
        Assert.Equal(HttpStatusCode.OK, page1Response.StatusCode);
        using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
        Assert.Equal(2, page1.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            draft2,
            Assert.Single(page1.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());

        var page2Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=2&pageSize=1&status=Draft");
        Assert.Equal(HttpStatusCode.OK, page2Response.StatusCode);
        using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
        Assert.Equal(2, page2.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            draft1,
            Assert.Single(page2.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_status_filter_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000081"),
            Guid.Parse("a2000000-0000-0000-0000-000000000081"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000081"),
            Guid.Parse("b2000000-0000-0000-0000-000000000081"));

        var draftA = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "A");
        await CreateAccrualAsync(workspaceB, "Revenue", 20m, "B");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10&status=Draft");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            draftA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_created_from_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000082"),
            Guid.Parse("a2000000-0000-0000-0000-000000000082"));

        var older = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Older");
        await Task.Delay(30);
        var newer = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Newer");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var newerCreated = baselineDoc.RootElement.GetProperty("items")[0].GetProperty("createdAtUtc").GetDateTimeOffset();

        var from = Uri.EscapeDataString(newerCreated.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={from}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            newer,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.DoesNotContain(
            document.RootElement.GetProperty("items").EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == older);
    }

    [Fact]
    public async Task ListPaged_created_to_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000083"),
            Guid.Parse("a2000000-0000-0000-0000-000000000083"));

        var older = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Older");
        await Task.Delay(30);
        var newer = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Newer");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var olderCreated = baselineDoc.RootElement.GetProperty("items")[1].GetProperty("createdAtUtc").GetDateTimeOffset();

        var to = Uri.EscapeDataString(olderCreated.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            older,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.DoesNotContain(
            document.RootElement.GetProperty("items").EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == newer);
    }

    [Fact]
    public async Task ListPaged_created_both_bounds_filter_closed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000084"),
            Guid.Parse("a2000000-0000-0000-0000-000000000084"));

        var first = await CreateAccrualAsync(workspaceId, "Revenue", 1m, "1");
        await Task.Delay(30);
        var second = await CreateAccrualAsync(workspaceId, "Revenue", 2m, "2");
        await Task.Delay(30);
        var third = await CreateAccrualAsync(workspaceId, "Revenue", 3m, "3");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var items = baselineDoc.RootElement.GetProperty("items");
        var secondCreated = items[1].GetProperty("createdAtUtc").GetDateTimeOffset();
        var thirdCreated = items[0].GetProperty("createdAtUtc").GetDateTimeOffset();

        var from = Uri.EscapeDataString(secondCreated.ToString("o"));
        var to = Uri.EscapeDataString(thirdCreated.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var filtered = document.RootElement.GetProperty("items");
        Assert.Equal(2, filtered.GetArrayLength());
        Assert.Equal(third, filtered[0].GetProperty("id").GetGuid());
        Assert.Equal(second, filtered[1].GetProperty("id").GetGuid());
        Assert.DoesNotContain(
            filtered.EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == first);
    }

    [Fact]
    public async Task ListPaged_created_equal_bounds_match_exact_instant()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000085"),
            Guid.Parse("a2000000-0000-0000-0000-000000000085"));

        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "EQ");
        await Task.Delay(20);
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Other");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var created = baselineDoc.RootElement.GetProperty("items")
            .EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == accrualId)
            .GetProperty("createdAtUtc")
            .GetDateTimeOffset();

        var bound = Uri.EscapeDataString(created.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={bound}&createdToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            accrualId,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_created_from_after_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000086"),
            Guid.Parse("a2000000-0000-0000-0000-000000000086"));

        var from = Uri.EscapeDataString(new DateTimeOffset(2026, 7, 21, 12, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2026, 7, 21, 8, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_malformed_created_from_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000087"),
            Guid.Parse("a2000000-0000-0000-0000-000000000087"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_malformed_created_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000088"),
            Guid.Parse("a2000000-0000-0000-0000-000000000088"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdToUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_created_range_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000089"),
            Guid.Parse("a2000000-0000-0000-0000-000000000089"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Now");

        var from = Uri.EscapeDataString(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2030, 1, 2, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(1, document.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(10, document.RootElement.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task ListPaged_created_range_with_Draft_status()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000090"),
            Guid.Parse("a2000000-0000-0000-0000-000000000090"));

        var draftId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        var recognizedId = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Recognized");
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{recognizedId}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(draftId, item.GetProperty("id").GetGuid());
        Assert.Equal("Draft", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ListPaged_created_range_pages_after_filter()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000091"),
            Guid.Parse("a2000000-0000-0000-0000-000000000091"));

        var first = await CreateAccrualAsync(workspaceId, "Revenue", 1m, "1");
        await Task.Delay(30);
        var second = await CreateAccrualAsync(workspaceId, "Revenue", 2m, "2");
        await Task.Delay(30);
        var third = await CreateAccrualAsync(workspaceId, "Revenue", 3m, "3");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var from = Uri.EscapeDataString(
            baselineDoc.RootElement.GetProperty("items")[2].GetProperty("createdAtUtc").GetDateTimeOffset().ToString("o"));
        var to = Uri.EscapeDataString(
            baselineDoc.RootElement.GetProperty("items")[0].GetProperty("createdAtUtc").GetDateTimeOffset().ToString("o"));

        var page1Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=1&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, page1Response.StatusCode);
        using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
        Assert.Equal(3, page1.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            third,
            Assert.Single(page1.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());

        var page2Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=2&pageSize=1&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, page2Response.StatusCode);
        using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
        Assert.Equal(3, page2.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            second,
            Assert.Single(page2.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_created_range_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000092"),
            Guid.Parse("a2000000-0000-0000-0000-000000000092"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000092"),
            Guid.Parse("b2000000-0000-0000-0000-000000000092"));

        var inA = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "A");
        await CreateAccrualAsync(workspaceB, "Revenue", 20m, "B");

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_created_range_matches_offset_equivalent_query_instant()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000093"),
            Guid.Parse("a2000000-0000-0000-0000-000000000093"));

        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Offset");
        await Task.Delay(20);
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Other");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var createdUtc = baselineDoc.RootElement.GetProperty("items")
            .EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == accrualId)
            .GetProperty("createdAtUtc")
            .GetDateTimeOffset();

        var equivalent = createdUtc.ToOffset(TimeSpan.FromHours(3));
        Assert.Equal(createdUtc.UtcTicks, equivalent.UtcTicks);

        var bound = Uri.EscapeDataString(equivalent.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={bound}&createdToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            accrualId,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_source_invoice_returns_only_matching()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000040"),
            Guid.Parse("a2000000-0000-0000-0000-000000000040"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Other", otherInvoiceId);
        var olderMatch = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Older match", invoiceId);
        var newerMatch = await CreateAccrualAsync(workspaceId, "Expense", 30m, "Newer match", invoiceId);
        await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Unlinked", null);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={invoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(newerMatch, items[0].GetProperty("id").GetGuid());
        Assert.Equal(olderMatch, items[1].GetProperty("id").GetGuid());
        Assert.All(items, item => Assert.Equal(invoiceId, item.GetProperty("sourceInvoiceId").GetGuid()));
    }

    [Fact]
    public async Task ListPaged_omitted_source_invoice_returns_linked_and_unlinked()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000041"),
            Guid.Parse("a2000000-0000-0000-0000-000000000041"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Linked", invoiceId);
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Unlinked", null);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_empty_source_invoice_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000042"),
            Guid.Parse("a2000000-0000-0000-0000-000000000042"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={Guid.Empty}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_malformed_source_invoice_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000043"),
            Guid.Parse("a2000000-0000-0000-0000-000000000043"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId=not-a-guid");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_source_invoice_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000044"),
            Guid.Parse("a2000000-0000-0000-0000-000000000044"));
        await CreateAccrualAsync(
            workspaceId,
            "Revenue",
            10m,
            "Linked",
            Guid.Parse("22222222-2222-2222-2222-222222222222"));

        var unknown = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={unknown}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_source_invoice_with_Draft_status_and_created_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000045"),
            Guid.Parse("a2000000-0000-0000-0000-000000000045"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Other invoice", otherInvoiceId);
        var match = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Draft match", invoiceId);
        var toRecognize = await CreateAccrualAsync(workspaceId, "Expense", 30m, "Recognized match", invoiceId);
        var recognizeResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{toRecognize}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognizeResponse.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&sourceInvoiceId={invoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_source_invoice_pages_after_filter()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000046"),
            Guid.Parse("a2000000-0000-0000-0000-000000000046"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "1", invoiceId);
        await CreateAccrualAsync(workspaceId, "Revenue", 20m, "2", invoiceId);
        await CreateAccrualAsync(workspaceId, "Expense", 30m, "3", invoiceId);
        await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Other", null);

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={invoiceId}");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        Assert.Equal(3, baselineDoc.RootElement.GetProperty("totalCount").GetInt32());
        var ordered = baselineDoc.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, ordered.Length);

        var page1 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=1&sourceInvoiceId={invoiceId}");
        var page2 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=2&pageSize=1&sourceInvoiceId={invoiceId}");
        Assert.Equal(HttpStatusCode.OK, page1.StatusCode);
        Assert.Equal(HttpStatusCode.OK, page2.StatusCode);

        using var page1Doc = JsonDocument.Parse(await page1.Content.ReadAsStringAsync());
        using var page2Doc = JsonDocument.Parse(await page2.Content.ReadAsStringAsync());
        Assert.Equal(3, page1Doc.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(3, page2Doc.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            ordered[0].GetProperty("id").GetGuid(),
            Assert.Single(page1Doc.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(
            ordered[1].GetProperty("id").GetGuid(),
            Assert.Single(page2Doc.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_source_invoice_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000047"),
            Guid.Parse("a2000000-0000-0000-0000-000000000047"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000047"),
            Guid.Parse("b2000000-0000-0000-0000-000000000047"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        var inA = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "A", invoiceId);
        await CreateAccrualAsync(workspaceB, "Revenue", 999m, "B", invoiceId);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={invoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_source_invoice_does_not_require_invoice_existence()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000048"),
            Guid.Parse("a2000000-0000-0000-0000-000000000048"));
        var unknownInvoiceId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var accrualId = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Orphan", unknownInvoiceId);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={unknownInvoiceId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            accrualId,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_omitted_type_returns_all_types()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000050"),
            Guid.Parse("a2000000-0000-0000-0000-000000000050"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Revenue");
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Expense");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_type_Revenue_returns_only_revenue()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000051"),
            Guid.Parse("a2000000-0000-0000-0000-000000000051"));

        await CreateAccrualAsync(workspaceId, "Expense", 10m, "Expense");
        var olderRevenue = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Older revenue");
        await Task.Delay(20);
        var newerRevenue = await CreateAccrualAsync(workspaceId, "Revenue", 30m, "Newer revenue");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=Revenue");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(newerRevenue, items[0].GetProperty("id").GetGuid());
        Assert.Equal(olderRevenue, items[1].GetProperty("id").GetGuid());
        Assert.All(items, item => Assert.Equal("Revenue", item.GetProperty("type").GetString()));
        Assert.Equal(1, root.GetProperty("page").GetInt32());
        Assert.Equal(10, root.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task ListPaged_type_Expense_returns_only_expense()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000052"),
            Guid.Parse("a2000000-0000-0000-0000-000000000052"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Revenue");
        var expense = await CreateAccrualAsync(workspaceId, "Expense", 20m, "Expense");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=Expense");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(expense, item.GetProperty("id").GetGuid());
        Assert.Equal("Expense", item.GetProperty("type").GetString());
    }

    [Fact]
    public async Task ListPaged_type_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000053"),
            Guid.Parse("a2000000-0000-0000-0000-000000000053"));
        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Revenue only");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=Expense");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_blank_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000054"),
            Guid.Parse("a2000000-0000-0000-0000-000000000054"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_whitespace_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000055"),
            Guid.Parse("a2000000-0000-0000-0000-000000000055"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=%20%20%20");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_lowercase_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000056"),
            Guid.Parse("a2000000-0000-0000-0000-000000000056"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=revenue");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_uppercase_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000057"),
            Guid.Parse("a2000000-0000-0000-0000-000000000057"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=REVENUE");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_unknown_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000058"),
            Guid.Parse("a2000000-0000-0000-0000-000000000058"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=Asset");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_numeric_type_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000059"),
            Guid.Parse("a2000000-0000-0000-0000-000000000059"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=1");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_type_with_Draft_status()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000060"),
            Guid.Parse("a2000000-0000-0000-0000-000000000060"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft revenue");
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Draft expense");
        var toRecognize = await CreateAccrualAsync(workspaceId, "Revenue", 30m, "Recognized revenue");
        var recognizeResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{toRecognize}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognizeResponse.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft&type=Revenue");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_type_with_created_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000061"),
            Guid.Parse("a2000000-0000-0000-0000-000000000061"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Earlier");
        await Task.Delay(20);
        var match = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "In range");
        await CreateAccrualAsync(workspaceId, "Expense", 30m, "Expense later");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var ordered = baselineDoc.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, ordered.Length);
        var from = Uri.EscapeDataString(ordered[1].GetProperty("createdAtUtc").GetDateTimeOffset().ToString("o"));
        var to = Uri.EscapeDataString(ordered[0].GetProperty("createdAtUtc").GetDateTimeOffset().ToString("o"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}&type=Revenue");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_type_with_source_invoice()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000062"),
            Guid.Parse("a2000000-0000-0000-0000-000000000062"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Match", invoiceId);
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Wrong type", invoiceId);
        await CreateAccrualAsync(workspaceId, "Revenue", 30m, "Wrong invoice", otherInvoiceId);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&sourceInvoiceId={invoiceId}&type=Revenue");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_type_composes_with_all_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000063"),
            Guid.Parse("a2000000-0000-0000-0000-000000000063"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Other invoice", otherInvoiceId);
        var match = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Draft match", invoiceId);
        await CreateAccrualAsync(workspaceId, "Expense", 30m, "Wrong type", invoiceId);
        var toRecognize = await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Recognized", invoiceId);
        var recognizeResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{toRecognize}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognizeResponse.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&sourceInvoiceId={invoiceId}&type=Revenue");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal(match, item.GetProperty("id").GetGuid());
        Assert.Equal("Revenue", item.GetProperty("type").GetString());
        Assert.Equal("Draft", item.GetProperty("status").GetString());
        Assert.Equal(invoiceId, item.GetProperty("sourceInvoiceId").GetGuid());
        Assert.True(item.TryGetProperty("amount", out _));
        Assert.True(item.TryGetProperty("createdAtUtc", out _));
    }

    [Fact]
    public async Task ListPaged_type_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000064"),
            Guid.Parse("a2000000-0000-0000-0000-000000000064"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000064"),
            Guid.Parse("b2000000-0000-0000-0000-000000000064"));

        var inA = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "A");
        await CreateAccrualAsync(workspaceB, "Revenue", 999m, "B");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10&type=Revenue");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognition_from_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000070"),
            Guid.Parse("a2000000-0000-0000-0000-000000000070"));

        var r0 = new DateTimeOffset(2026, 7, 10, 0, 0, 0, TimeSpan.Zero);
        var r1 = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);
        var r2 = new DateTimeOffset(2026, 7, 30, 0, 0, 0, TimeSpan.Zero);

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Earlier", recognitionDateUtc: r0);
        var onBound = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "On", recognitionDateUtc: r1);
        var later = await CreateAccrualAsync(workspaceId, "Expense", 30m, "Later", recognitionDateUtc: r2);

        var from = Uri.EscapeDataString(r1.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={from}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var ids = root.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToHashSet();
        Assert.Contains(onBound, ids);
        Assert.Contains(later, ids);
    }

    [Fact]
    public async Task ListPaged_recognition_to_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000071"),
            Guid.Parse("a2000000-0000-0000-0000-000000000071"));

        var r0 = new DateTimeOffset(2026, 7, 10, 0, 0, 0, TimeSpan.Zero);
        var r1 = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);
        var r2 = new DateTimeOffset(2026, 7, 30, 0, 0, 0, TimeSpan.Zero);

        var earlier = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Earlier", recognitionDateUtc: r0);
        var onBound = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "On", recognitionDateUtc: r1);
        await CreateAccrualAsync(workspaceId, "Expense", 30m, "Later", recognitionDateUtc: r2);

        var to = Uri.EscapeDataString(r1.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var ids = root.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToHashSet();
        Assert.Contains(earlier, ids);
        Assert.Contains(onBound, ids);
    }

    [Fact]
    public async Task ListPaged_recognition_both_bounds_filter_closed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000072"),
            Guid.Parse("a2000000-0000-0000-0000-000000000072"));

        var r0 = new DateTimeOffset(2026, 7, 10, 0, 0, 0, TimeSpan.Zero);
        var r1 = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);
        var r2 = new DateTimeOffset(2026, 7, 30, 0, 0, 0, TimeSpan.Zero);

        var earlier = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Earlier", recognitionDateUtc: r0);
        var mid = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Mid", recognitionDateUtc: r1);
        await CreateAccrualAsync(workspaceId, "Expense", 30m, "Later", recognitionDateUtc: r2);

        var from = Uri.EscapeDataString(r0.ToString("o"));
        var to = Uri.EscapeDataString(r1.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={from}&recognitionToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var ids = root.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToHashSet();
        Assert.Contains(earlier, ids);
        Assert.Contains(mid, ids);
    }

    [Fact]
    public async Task ListPaged_recognition_equal_bounds_match_exact_instant()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000073"),
            Guid.Parse("a2000000-0000-0000-0000-000000000073"));

        var bound = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);
        var match = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Match", recognitionDateUtc: bound);
        await CreateAccrualAsync(
            workspaceId, "Expense", 20m, "Other",
            recognitionDateUtc: bound.AddDays(-1));

        var encoded = Uri.EscapeDataString(bound.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={encoded}&recognitionToUtc={encoded}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognition_from_after_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000074"),
            Guid.Parse("a2000000-0000-0000-0000-000000000074"));

        var from = Uri.EscapeDataString(new DateTimeOffset(2026, 7, 30, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2026, 7, 10, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={from}&recognitionToUtc={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_malformed_recognition_from_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000075"),
            Guid.Parse("a2000000-0000-0000-0000-000000000075"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_malformed_recognition_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000076"),
            Guid.Parse("a2000000-0000-0000-0000-000000000076"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionToUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_recognition_range_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000077"),
            Guid.Parse("a2000000-0000-0000-0000-000000000077"));

        await CreateAccrualAsync(
            workspaceId, "Revenue", 10m, "Now",
            recognitionDateUtc: new DateTimeOffset(2026, 7, 10, 0, 0, 0, TimeSpan.Zero));

        var from = Uri.EscapeDataString(new DateTimeOffset(2026, 8, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2026, 8, 31, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={from}&recognitionToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Empty(document.RootElement.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task ListPaged_recognition_composes_with_all_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000078"),
            Guid.Parse("a2000000-0000-0000-0000-000000000078"));
        var invoiceId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        var recognition = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);

        var match = await CreateAccrualAsync(
            workspaceId, "Revenue", 10m, "Match", invoiceId, recognition);
        await CreateAccrualAsync(
            workspaceId, "Expense", 20m, "Wrong type", invoiceId, recognition);
        await CreateAccrualAsync(
            workspaceId, "Revenue", 30m, "Wrong invoice", otherInvoiceId, recognition);
        await CreateAccrualAsync(
            workspaceId, "Revenue", 40m, "Wrong recognition", invoiceId,
            recognition.AddDays(-5));
        var toRecognize = await CreateAccrualAsync(
            workspaceId, "Revenue", 50m, "Wrong status", invoiceId, recognition);
        var recognize = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/{toRecognize}/recognize",
            null);
        Assert.Equal(HttpStatusCode.OK, recognize.StatusCode);

        var list = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var allDoc = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        var createdAt = allDoc.RootElement.GetProperty("items").EnumerateArray()
            .First(item => item.GetProperty("id").GetGuid() == match)
            .GetProperty("createdAtUtc").GetDateTimeOffset();
        var from = Uri.EscapeDataString(createdAt.AddMinutes(-1).ToString("o"));
        var to = Uri.EscapeDataString(createdAt.AddMinutes(1).ToString("o"));
        var recognitionEncoded = Uri.EscapeDataString(recognition.ToString("o"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&sourceInvoiceId={invoiceId}&type=Revenue&recognitionFromUtc={recognitionEncoded}&recognitionToUtc={recognitionEncoded}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognition_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000079"),
            Guid.Parse("a2000000-0000-0000-0000-000000000079"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000079"),
            Guid.Parse("b2000000-0000-0000-0000-000000000079"));

        var recognition = new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);
        var inA = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "A", recognitionDateUtc: recognition);
        await CreateAccrualAsync(workspaceB, "Revenue", 999m, "B", recognitionDateUtc: recognition);

        var from = Uri.EscapeDataString(recognition.AddDays(-1).ToString("o"));
        var to = Uri.EscapeDataString(recognition.AddDays(1).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={from}&recognitionToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognition_range_matches_offset_equivalent_query_instant()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000080"),
            Guid.Parse("a2000000-0000-0000-0000-000000000080"));

        var storedInstant = new DateTimeOffset(2026, 7, 21, 8, 0, 0, TimeSpan.Zero);
        var queryInstant = new DateTimeOffset(2026, 7, 21, 11, 0, 0, TimeSpan.FromHours(3));
        Assert.Equal(storedInstant.UtcTicks, queryInstant.UtcTicks);

        var match = await CreateAccrualAsync(
            workspaceId, "Revenue", 10m, "Offset", recognitionDateUtc: storedInstant);
        await CreateAccrualAsync(
            workspaceId, "Expense", 20m, "Before",
            recognitionDateUtc: storedInstant.AddMinutes(-1));

        var bound = Uri.EscapeDataString(queryInstant.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={bound}&recognitionToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_currency_returns_only_matching()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000081"),
            Guid.Parse("a2000000-0000-0000-0000-000000000081"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Other", currency: "EUR");
        var olderMatch = await CreateAccrualAsync(workspaceId, "Revenue", 20m, "Older", currency: "USD");
        await Task.Delay(20);
        var newerMatch = await CreateAccrualAsync(workspaceId, "Expense", 30m, "Newer", currency: "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(newerMatch, items[0].GetProperty("id").GetGuid());
        Assert.Equal(olderMatch, items[1].GetProperty("id").GetGuid());
        Assert.All(items, item => Assert.Equal("USD", item.GetProperty("currency").GetString()));
    }

    [Fact]
    public async Task ListPaged_omitted_currency_returns_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000082"),
            Guid.Parse("a2000000-0000-0000-0000-000000000082"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "A", currency: "UAH");
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "B", currency: "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_lowercase_currency_normalizes_and_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000083"),
            Guid.Parse("a2000000-0000-0000-0000-000000000083"));
        var match = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "USD", currency: "USD");
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "EUR", currency: "EUR");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&currency=usd");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(
            "USD",
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("currency").GetString());
    }

    [Fact]
    public async Task ListPaged_blank_currency_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000084"),
            Guid.Parse("a2000000-0000-0000-0000-000000000084"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&currency=");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_whitespace_currency_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000085"),
            Guid.Parse("a2000000-0000-0000-0000-000000000085"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&currency=%20%20%20");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_currency_trims_query_value()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000086"),
            Guid.Parse("a2000000-0000-0000-0000-000000000086"));
        var match = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Trim", currency: "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&currency=%20%20USD%20%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_currency_composes_with_type()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000087"),
            Guid.Parse("a2000000-0000-0000-0000-000000000087"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Match", currency: "USD");
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "Wrong type", currency: "USD");
        await CreateAccrualAsync(workspaceId, "Revenue", 30m, "Wrong currency", currency: "EUR");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&type=Revenue&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_currency_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000088"),
            Guid.Parse("a2000000-0000-0000-0000-000000000088"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("b1000000-0000-0000-0000-000000000088"),
            Guid.Parse("b2000000-0000-0000-0000-000000000088"));

        var inA = await CreateAccrualAsync(workspaceA, "Revenue", 10m, "A", currency: "USD");
        await CreateAccrualAsync(workspaceB, "Revenue", 20m, "B", currency: "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/accruals/paged?page=1&pageSize=10&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_omitted_amount_bounds_returns_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000091"),
            Guid.Parse("a2000000-0000-0000-0000-000000000091"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "A");
        await CreateAccrualAsync(workspaceId, "Expense", 100m, "B");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_amount_from_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000092"),
            Guid.Parse("a2000000-0000-0000-0000-000000000092"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Below");
        var onBound = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "On bound");
        await Task.Delay(20);
        var above = await CreateAccrualAsync(workspaceId, "Expense", 100m, "Above");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountFrom=50");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var items = document.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(above, items[0].GetProperty("id").GetGuid());
        Assert.Equal(onBound, items[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_amount_to_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000093"),
            Guid.Parse("a2000000-0000-0000-0000-000000000093"));

        var below = await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Below");
        await Task.Delay(20);
        var onBound = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "On bound");
        await CreateAccrualAsync(workspaceId, "Expense", 100m, "Above");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountTo=50");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var items = document.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(onBound, items[0].GetProperty("id").GetGuid());
        Assert.Equal(below, items[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_amount_both_bounds_filter_closed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000094"),
            Guid.Parse("a2000000-0000-0000-0000-000000000094"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Below");
        var low = await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Low");
        await Task.Delay(20);
        var high = await CreateAccrualAsync(workspaceId, "Expense", 60m, "High");
        await CreateAccrualAsync(workspaceId, "Revenue", 100m, "Above");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountFrom=40&amountTo=60");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var items = document.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(high, items[0].GetProperty("id").GetGuid());
        Assert.Equal(low, items[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_amount_equal_bounds_match_exact_amount()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000095"),
            Guid.Parse("a2000000-0000-0000-0000-000000000095"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Match");
        await CreateAccrualAsync(workspaceId, "Expense", 51m, "Other");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountFrom=50&amountTo=50");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_amount_from_greater_than_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000096"),
            Guid.Parse("a2000000-0000-0000-0000-000000000096"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountFrom=100&amountTo=10");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_malformed_amount_from_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000097"),
            Guid.Parse("a2000000-0000-0000-0000-000000000097"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountFrom=not-a-decimal");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_malformed_amount_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000098"),
            Guid.Parse("a2000000-0000-0000-0000-000000000098"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&amountTo=not-a-decimal");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_amount_composes_with_currency()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-000000000099"),
            Guid.Parse("a2000000-0000-0000-0000-000000000099"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Match", currency: "USD");
        await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Wrong currency", currency: "EUR");
        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Wrong amount", currency: "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&currency=USD&amountFrom=40&amountTo=60");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_description_exact_match_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000a1"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000a1"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Exact match");
        await CreateAccrualAsync(workspaceId, "Revenue", 50m, "exact match");
        await CreateAccrualAsync(workspaceId, "Expense", 50m, "Other");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&description=Exact%20match");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_description_trims_query_value()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000a2"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000a2"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Trimmed");
        await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Other");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&description=%20%20Trimmed%20%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_blank_description_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000a3"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000a3"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&description=%20%20");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_description_composes_with_currency_and_status()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000a4"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000a4"));

        var match = await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Target", currency: "USD");
        await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Target", currency: "EUR");
        await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Other", currency: "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&status=Draft&currency=USD&description=Target");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_omitted_description_preserves_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000a5"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000a5"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "A");
        await CreateAccrualAsync(workspaceId, "Expense", 20m, "B");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task ListPaged_recognized_from_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b1"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b1"));

        var early = await SeedRecognizedAccrualAsync(
            workspaceId, "Early", T0, T0);
        var onBound = await SeedRecognizedAccrualAsync(
            workspaceId, "On", T1, T1);
        var late = await SeedRecognizedAccrualAsync(
            workspaceId, "Late", T2, T2);
        await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Draft");

        var from = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognizedFromUtc={from}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var ids = document.RootElement.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToArray();
        Assert.Contains(onBound, ids);
        Assert.Contains(late, ids);
        Assert.DoesNotContain(early, ids);
    }

    [Fact]
    public async Task ListPaged_recognized_both_bounds_filter_closed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b2"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b2"));

        await SeedRecognizedAccrualAsync(workspaceId, "Early", T0, T0);
        var mid = await SeedRecognizedAccrualAsync(workspaceId, "Mid", T1, T1);
        await SeedRecognizedAccrualAsync(workspaceId, "Late", T2, T2);

        var from = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var to = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognizedFromUtc={from}&recognizedToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            mid,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognized_bound_excludes_draft_null_recognized_at()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b3"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b3"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        var recognized = await SeedRecognizedAccrualAsync(workspaceId, "Recognized", T1, T1);

        var from = Uri.EscapeDataString("2026-07-20T10:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognizedFromUtc={from}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            recognized,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognized_from_after_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b4"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b4"));

        var from = Uri.EscapeDataString("2026-07-20T12:00:00+00:00");
        var to = Uri.EscapeDataString("2026-07-20T10:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognizedFromUtc={from}&recognizedToUtc={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_malformed_recognized_from_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b5"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b5"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognizedFromUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_recognized_composes_with_description()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b6"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b6"));

        var match = await SeedRecognizedAccrualAsync(workspaceId, "Target", T1, T1);
        await SeedRecognizedAccrualAsync(workspaceId, "Other", T1, T1);
        await CreateAccrualAsync(workspaceId, "Revenue", 50m, "Target");

        var bound = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&description=Target&recognizedFromUtc={bound}&recognizedToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_recognized_is_independent_of_recognition_date_param()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000b7"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000b7"));

        var match = await SeedRecognizedAccrualAsync(
            workspaceId, "Match", T1, T1, recognitionDate: RecognitionDate);
        await SeedRecognizedAccrualAsync(
            workspaceId, "Wrong", T1, T1, recognitionDate: RecognitionDateAlt);

        var recognition = Uri.EscapeDataString("2026-07-31T00:00:00+00:00");
        var recognized = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognitionFromUtc={recognition}&recognitionToUtc={recognition}&recognizedFromUtc={recognized}&recognizedToUtc={recognized}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_reversed_from_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c1"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c1"));

        var early = await SeedReversedAccrualAsync(workspaceId, "Early", T0, T0, T0);
        var onBound = await SeedReversedAccrualAsync(workspaceId, "On", T1, T1, T1);
        var late = await SeedReversedAccrualAsync(workspaceId, "Late", T2, T2, T2);
        await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Draft");

        var from = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversedFromUtc={from}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var ids = document.RootElement.GetProperty("items").EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToArray();
        Assert.Contains(onBound, ids);
        Assert.Contains(late, ids);
        Assert.DoesNotContain(early, ids);
    }

    [Fact]
    public async Task ListPaged_reversed_both_bounds_filter_closed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c2"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c2"));

        await SeedReversedAccrualAsync(workspaceId, "Early", T0, T0, T0);
        var mid = await SeedReversedAccrualAsync(workspaceId, "Mid", T1, T1, T1);
        await SeedReversedAccrualAsync(workspaceId, "Late", T2, T2, T2);

        var bound = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversedFromUtc={bound}&reversedToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            mid,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_reversed_bound_excludes_null_reversed_at()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c3"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c3"));

        await CreateAccrualAsync(workspaceId, "Revenue", 10m, "Draft");
        await SeedRecognizedAccrualAsync(workspaceId, "Recognized", T1, T1);
        var reversed = await SeedReversedAccrualAsync(workspaceId, "Reversed", T1, T1, T1);

        var from = Uri.EscapeDataString("2026-07-20T10:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversedFromUtc={from}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            reversed,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_reversed_from_after_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c4"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c4"));

        var from = Uri.EscapeDataString("2026-07-20T12:00:00+00:00");
        var to = Uri.EscapeDataString("2026-07-20T10:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversedFromUtc={from}&reversedToUtc={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_malformed_reversed_from_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c5"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c5"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversedFromUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ListPaged_reversed_composes_with_description()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c6"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c6"));

        var match = await SeedReversedAccrualAsync(workspaceId, "Target", T1, T1, T1);
        await SeedReversedAccrualAsync(workspaceId, "Other", T1, T1, T1);
        await SeedRecognizedAccrualAsync(workspaceId, "Target", T1, T1);

        var bound = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&description=Target&reversedFromUtc={bound}&reversedToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_reversed_is_independent_of_recognized_at_param()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000c7"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000c7"));

        var match = await SeedReversedAccrualAsync(workspaceId, "Match", T0, T0, T1);
        await SeedReversedAccrualAsync(workspaceId, "Wrong recognized", T0, T1, T1);
        await SeedReversedAccrualAsync(workspaceId, "Wrong reversed", T0, T0, T2);

        var recognized = Uri.EscapeDataString("2026-07-20T10:00:00+00:00");
        var reversed = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&recognizedFromUtc={recognized}&recognizedToUtc={recognized}&reversedFromUtc={reversed}&reversedToUtc={reversed}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_reversal_reason_exact_match_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000d1"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000d1"));

        var match = await SeedReversedAccrualAsync(
            workspaceId, "Match", T1, T1, T1, reason: "Exact reason");
        await SeedReversedAccrualAsync(
            workspaceId, "Other", T1, T1, T1, reason: "Other reason");
        await SeedReversedAccrualAsync(
            workspaceId, "Case", T2, T2, T2, reason: "exact reason");
        await CreateAccrualAsync(workspaceId, "Revenue", 40m, "Draft");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversalReason=Exact%20reason");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_reversal_reason_trims_query_value()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000d2"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000d2"));

        var match = await SeedReversedAccrualAsync(
            workspaceId, "Match", T1, T1, T1, reason: "Trimmed");
        await SeedReversedAccrualAsync(
            workspaceId, "Other", T1, T1, T1, reason: "Other");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversalReason=%20%20Trimmed%20%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_blank_reversal_reason_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000d3"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000d3"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversalReason=%20%20");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task ListPaged_reversal_reason_composes_with_reversed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000d4"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000d4"));

        var match = await SeedReversedAccrualAsync(
            workspaceId, "Match", T1, T1, T1, reason: "Target");
        await SeedReversedAccrualAsync(
            workspaceId, "Wrong", T1, T1, T1, reason: "Other");
        await SeedReversedAccrualAsync(
            workspaceId, "Late", T2, T2, T2, reason: "Target");

        var bound = Uri.EscapeDataString("2026-07-20T11:00:00+00:00");
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10&reversalReason=Target&reversedFromUtc={bound}&reversedToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task ListPaged_omitted_reversal_reason_preserves_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("a1000000-0000-0000-0000-0000000000d5"),
            Guid.Parse("a2000000-0000-0000-0000-0000000000d5"));

        await SeedReversedAccrualAsync(workspaceId, "A", T0, T0, T0, reason: "One");
        await SeedReversedAccrualAsync(workspaceId, "B", T1, T1, T1, reason: "Two");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals/paged?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
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
        Assert.Contains("ListAccrualsPaged", json);
        Assert.Contains("ListAccrualsByInvoice", json);
        Assert.Contains("GetAccrualById", json);
        Assert.Contains("RecognizeAccrual", json);
        Assert.Contains("ReverseAccrual", json);
        Assert.Contains("pageSize", json);
        Assert.Contains("status", json);
        Assert.Contains("createdFromUtc", json);
        Assert.Contains("createdToUtc", json);
        Assert.Contains("sourceInvoiceId", json);
        Assert.Contains("recognitionFromUtc", json);
        Assert.Contains("recognitionToUtc", json);
        Assert.Contains("recognizedFromUtc", json);
        Assert.Contains("recognizedToUtc", json);
        Assert.Contains("reversedFromUtc", json);
        Assert.Contains("reversedToUtc", json);
        Assert.Contains("reversalReason", json);
        Assert.Contains("currency", json);
        Assert.Contains("date-time", json);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "\"ListAccruals\""));
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "\"ListAccrualsPaged\""));
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
        Guid? sourceInvoiceId = null,
        DateTimeOffset? recognitionDateUtc = null,
        string currency = "UAH")
    {
        var response = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/accruals",
            new
            {
                type,
                amount,
                currency,
                recognitionDateUtc = recognitionDateUtc ?? RecognitionDate,
                description,
                sourceInvoiceId
            });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return document.RootElement.GetProperty("id").GetGuid();
    }

    private async Task<Guid> SeedRecognizedAccrualAsync(
        Guid workspaceId,
        string description,
        DateTimeOffset createdAt,
        DateTimeOffset recognizedAt,
        DateTimeOffset? recognitionDate = null)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FinanceDbContext>();
        var accrual = Accrual.Create(
            AccrualId.New(),
            new FinanceWorkspaceId(workspaceId),
            AccrualType.Revenue,
            50m,
            new Currency("UAH"),
            recognitionDate ?? RecognitionDate,
            description,
            sourceInvoiceId: null,
            createdAt);
        accrual.Recognize(recognizedAt);
        db.Accruals.Add(accrual);
        await db.SaveChangesAsync();
        return accrual.Id.Value;
    }

    private async Task<Guid> SeedReversedAccrualAsync(
        Guid workspaceId,
        string description,
        DateTimeOffset createdAt,
        DateTimeOffset recognizedAt,
        DateTimeOffset reversedAt,
        DateTimeOffset? recognitionDate = null,
        string reason = "Seed reverse")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<FinanceDbContext>();
        var accrual = Accrual.Create(
            AccrualId.New(),
            new FinanceWorkspaceId(workspaceId),
            AccrualType.Revenue,
            50m,
            new Currency("UAH"),
            recognitionDate ?? RecognitionDate,
            description,
            sourceInvoiceId: null,
            createdAt);
        accrual.Recognize(recognizedAt);
        accrual.Reverse(reason, reversedAt);
        db.Accruals.Add(accrual);
        await db.SaveChangesAsync();
        return accrual.Id.Value;
    }

    private static async Task AssertErrorAsync(HttpResponseMessage response, string error)
    {
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(error, document.RootElement.GetProperty("error").GetString());
    }
}
