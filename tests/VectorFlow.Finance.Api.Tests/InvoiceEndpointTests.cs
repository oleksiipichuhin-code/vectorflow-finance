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
    public async Task List_returns_only_requested_workspace_newest_first()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000020"),
            Guid.Parse("c2000000-0000-0000-0000-000000000020"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000020"),
            Guid.Parse("d2000000-0000-0000-0000-000000000020"));

        var older = await CreateInvoiceAsync(workspaceA, "INV-OLD", "cp-old", "UAH");
        await Task.Delay(20);
        var newer = await CreateInvoiceAsync(workspaceA, "INV-NEW", "cp-new", "UAH");
        await CreateInvoiceAsync(workspaceB, "INV-OTHER", "cp-other", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(10, document.RootElement.GetProperty("pageSize").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(2, items.GetArrayLength());
        Assert.Equal(newer, items[0].GetProperty("id").GetGuid());
        Assert.Equal(older, items[1].GetProperty("id").GetGuid());
        Assert.Equal("INV-NEW", items[0].GetProperty("documentNumber").GetString());
        Assert.Equal("Draft", items[0].GetProperty("status").GetString());
        Assert.True(items[0].TryGetProperty("createdAtUtc", out _));
        Assert.True(items[0].TryGetProperty("lines", out _));
    }

    [Fact]
    public async Task List_empty_workspace_returns_empty_items()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000021"),
            Guid.Parse("c2000000-0000-0000-0000-000000000021"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(1, document.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(20, document.RootElement.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task List_multiple_pages_preserve_order_and_total()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000047"),
            Guid.Parse("c2000000-0000-0000-0000-000000000047"));

        var first = await CreateInvoiceAsync(workspaceId, "INV-1", "cp-1", "UAH");
        await Task.Delay(20);
        var second = await CreateInvoiceAsync(workspaceId, "INV-2", "cp-2", "UAH");
        await Task.Delay(20);
        var third = await CreateInvoiceAsync(workspaceId, "INV-3", "cp-3", "UAH");

        var page1Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page1Response.StatusCode);
        using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
        Assert.Equal(3, page1.RootElement.GetProperty("totalCount").GetInt32());
        var page1Items = page1.RootElement.GetProperty("items");
        Assert.Equal(2, page1Items.GetArrayLength());
        Assert.Equal(third, page1Items[0].GetProperty("id").GetGuid());
        Assert.Equal(second, page1Items[1].GetProperty("id").GetGuid());

        var page2Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=2&pageSize=2");
        Assert.Equal(HttpStatusCode.OK, page2Response.StatusCode);
        using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
        Assert.Equal(3, page2.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            first,
            Assert.Single(page2.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_empty_finance_workspace_id_returns_400()
    {
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{Guid.Empty}/invoices?page=1&pageSize=10");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_invalid_page_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000048"),
            Guid.Parse("c2000000-0000-0000-0000-000000000048"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=0&pageSize=10");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_invalid_page_size_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000049"),
            Guid.Parse("c2000000-0000-0000-0000-000000000049"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=101");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_status_Draft_returns_only_drafts()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000050"),
            Guid.Parse("c2000000-0000-0000-0000-000000000050"));

        var draftId = await CreateInvoiceAsync(workspaceId, "INV-DRAFT", "cp-draft", "UAH");
        var issuedId = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISSUED");
        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{issuedId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Draft");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(draftId, item.GetProperty("id").GetGuid());
        Assert.Equal("Draft", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task List_status_Issued_returns_only_issued()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000051"),
            Guid.Parse("c2000000-0000-0000-0000-000000000051"));

        await CreateInvoiceAsync(workspaceId, "INV-DRAFT", "cp-draft", "UAH");
        var issuedId = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISSUED");
        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{issuedId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Issued");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(issuedId, item.GetProperty("id").GetGuid());
        Assert.Equal("Issued", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task List_omitted_status_returns_all_statuses()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000052"),
            Guid.Parse("c2000000-0000-0000-0000-000000000052"));

        var draftId = await CreateInvoiceAsync(workspaceId, "INV-DRAFT", "cp-draft", "UAH");
        var issuedId = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISSUED");
        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{issuedId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(2, items.GetArrayLength());
        var ids = items.EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToHashSet();
        Assert.Contains(draftId, ids);
        Assert.Contains(issuedId, ids);
    }

    [Fact]
    public async Task List_explicit_blank_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000053"),
            Guid.Parse("c2000000-0000-0000-0000-000000000053"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_whitespace_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000054"),
            Guid.Parse("c2000000-0000-0000-0000-000000000054"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=%20%20%20");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_lowercase_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000055"),
            Guid.Parse("c2000000-0000-0000-0000-000000000055"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=draft");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_unknown_status_Paid_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000056"),
            Guid.Parse("c2000000-0000-0000-0000-000000000056"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Paid");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_numeric_status_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000057"),
            Guid.Parse("c2000000-0000-0000-0000-000000000057"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=0");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_status_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000058"),
            Guid.Parse("c2000000-0000-0000-0000-000000000058"));

        await CreateInvoiceAsync(workspaceId, "INV-DRAFT", "cp-draft", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Issued");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task List_status_filter_pages_within_filtered_set()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000059"),
            Guid.Parse("c2000000-0000-0000-0000-000000000059"));

        var draft1 = await CreateInvoiceAsync(workspaceId, "INV-D1", "cp-1", "UAH");
        await Task.Delay(20);
        var draft2 = await CreateInvoiceAsync(workspaceId, "INV-D2", "cp-2", "UAH");
        await Task.Delay(20);
        var issuedId = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISS");
        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{issuedId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var page1Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=1&status=Draft");
        Assert.Equal(HttpStatusCode.OK, page1Response.StatusCode);
        using var page1 = JsonDocument.Parse(await page1Response.Content.ReadAsStringAsync());
        Assert.Equal(2, page1.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            draft2,
            Assert.Single(page1.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());

        var page2Response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=2&pageSize=1&status=Draft");
        Assert.Equal(HttpStatusCode.OK, page2Response.StatusCode);
        using var page2 = JsonDocument.Parse(await page2Response.Content.ReadAsStringAsync());
        Assert.Equal(2, page2.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            draft1,
            Assert.Single(page2.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_status_filter_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000060"),
            Guid.Parse("c2000000-0000-0000-0000-000000000060"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000060"),
            Guid.Parse("d2000000-0000-0000-0000-000000000060"));

        var draftA = await CreateInvoiceAsync(workspaceA, "INV-A", "cp-a", "UAH");
        await CreateInvoiceAsync(workspaceB, "INV-B", "cp-b", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices?page=1&pageSize=10&status=Draft");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            draftA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_omitted_created_bounds_returns_all_matching_status_semantics()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000061"),
            Guid.Parse("c2000000-0000-0000-0000-000000000061"));

        var first = await CreateInvoiceAsync(workspaceId, "INV-1", "cp-1", "UAH");
        await Task.Delay(20);
        var second = await CreateInvoiceAsync(workspaceId, "INV-2", "cp-2", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        var items = document.RootElement.GetProperty("items");
        Assert.Equal(2, items.GetArrayLength());
        Assert.Equal(second, items[0].GetProperty("id").GetGuid());
        Assert.Equal(first, items[1].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_created_from_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000062"),
            Guid.Parse("c2000000-0000-0000-0000-000000000062"));

        var older = await CreateInvoiceAsync(workspaceId, "INV-OLD", "cp", "UAH");
        await Task.Delay(30);
        var newer = await CreateInvoiceAsync(workspaceId, "INV-NEW", "cp", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var newerCreated = baselineDoc.RootElement.GetProperty("items")[0].GetProperty("createdAtUtc").GetDateTimeOffset();

        var from = Uri.EscapeDataString(newerCreated.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc={from}");
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
    public async Task List_created_to_only_filters_inclusive()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000063"),
            Guid.Parse("c2000000-0000-0000-0000-000000000063"));

        var older = await CreateInvoiceAsync(workspaceId, "INV-OLD", "cp", "UAH");
        await Task.Delay(30);
        var newer = await CreateInvoiceAsync(workspaceId, "INV-NEW", "cp", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var olderCreated = baselineDoc.RootElement.GetProperty("items")[1].GetProperty("createdAtUtc").GetDateTimeOffset();

        var to = Uri.EscapeDataString(olderCreated.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdToUtc={to}");
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
    public async Task List_created_both_bounds_filter_closed_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000064"),
            Guid.Parse("c2000000-0000-0000-0000-000000000064"));

        var first = await CreateInvoiceAsync(workspaceId, "INV-1", "cp", "UAH");
        await Task.Delay(30);
        var second = await CreateInvoiceAsync(workspaceId, "INV-2", "cp", "UAH");
        await Task.Delay(30);
        var third = await CreateInvoiceAsync(workspaceId, "INV-3", "cp", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var items = baselineDoc.RootElement.GetProperty("items");
        var secondCreated = items[1].GetProperty("createdAtUtc").GetDateTimeOffset();
        var thirdCreated = items[0].GetProperty("createdAtUtc").GetDateTimeOffset();

        var from = Uri.EscapeDataString(secondCreated.ToString("o"));
        var to = Uri.EscapeDataString(thirdCreated.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");
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
    public async Task List_created_equal_bounds_match_exact_instant()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000065"),
            Guid.Parse("c2000000-0000-0000-0000-000000000065"));

        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-EQ", "cp", "UAH");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var created = baselineDoc.RootElement.GetProperty("items")
            .EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == invoiceId)
            .GetProperty("createdAtUtc")
            .GetDateTimeOffset();

        var bound = Uri.EscapeDataString(created.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc={bound}&createdToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            invoiceId,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_created_from_after_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000066"),
            Guid.Parse("c2000000-0000-0000-0000-000000000066"));

        var from = Uri.EscapeDataString(new DateTimeOffset(2026, 7, 21, 12, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2026, 7, 21, 8, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_malformed_created_from_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000067"),
            Guid.Parse("c2000000-0000-0000-0000-000000000067"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_malformed_created_to_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000068"),
            Guid.Parse("c2000000-0000-0000-0000-000000000068"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdToUtc=not-a-date");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_created_range_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000069"),
            Guid.Parse("c2000000-0000-0000-0000-000000000069"));

        await CreateInvoiceAsync(workspaceId, "INV-NOW", "cp", "UAH");

        var from = Uri.EscapeDataString(new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2030, 1, 2, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
        Assert.Equal(1, document.RootElement.GetProperty("page").GetInt32());
        Assert.Equal(10, document.RootElement.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task List_created_range_with_Draft_status()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000070"),
            Guid.Parse("c2000000-0000-0000-0000-000000000070"));

        var draftId = await CreateInvoiceAsync(workspaceId, "INV-DRAFT", "cp", "UAH");
        var issuedId = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISS");
        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{issuedId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(draftId, item.GetProperty("id").GetGuid());
        Assert.Equal("Draft", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task List_created_range_with_Issued_status()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000071"),
            Guid.Parse("c2000000-0000-0000-0000-000000000071"));

        await CreateInvoiceAsync(workspaceId, "INV-DRAFT", "cp", "UAH");
        var issuedId = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISS");
        var issue = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{issuedId}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issue.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Issued&createdFromUtc={from}&createdToUtc={to}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        var item = Assert.Single(document.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(issuedId, item.GetProperty("id").GetGuid());
        Assert.Equal("Issued", item.GetProperty("status").GetString());
    }

    [Fact]
    public async Task List_created_range_matches_offset_equivalent_query_instant()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000072"),
            Guid.Parse("c2000000-0000-0000-0000-000000000072"));

        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-OFF", "cp", "UAH");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        var createdUtc = baselineDoc.RootElement.GetProperty("items")
            .EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == invoiceId)
            .GetProperty("createdAtUtc")
            .GetDateTimeOffset();

        var equivalent = createdUtc.ToOffset(TimeSpan.FromHours(3));
        Assert.Equal(createdUtc.UtcTicks, equivalent.UtcTicks);
        Assert.Equal(TimeSpan.FromHours(3), equivalent.Offset);

        var bound = Uri.EscapeDataString(equivalent.ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&createdFromUtc={bound}&createdToUtc={bound}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            invoiceId,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_document_number_returns_only_matching()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000080"),
            Guid.Parse("c2000000-0000-0000-0000-000000000080"));

        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "UAH");
        var olderMatch = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "UAH");
        await Task.Delay(20);
        var newerMatch = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "UAH");
        await CreateInvoiceAsync(workspaceId, "inv-match", "cp", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=INV-MATCH");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(newerMatch, items[0].GetProperty("id").GetGuid());
        Assert.Equal(olderMatch, items[1].GetProperty("id").GetGuid());
        Assert.All(items, item => Assert.Equal("INV-MATCH", item.GetProperty("documentNumber").GetString()));
    }

    [Fact]
    public async Task List_omitted_document_number_returns_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000081"),
            Guid.Parse("c2000000-0000-0000-0000-000000000081"));

        await CreateInvoiceAsync(workspaceId, "INV-A", "cp", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-B", "cp", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task List_document_number_no_match_returns_empty_page()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000082"),
            Guid.Parse("c2000000-0000-0000-0000-000000000082"));
        await CreateInvoiceAsync(workspaceId, "INV-A", "cp", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=INV-MISSING");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(0, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(0, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task List_blank_document_number_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000083"),
            Guid.Parse("c2000000-0000-0000-0000-000000000083"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_whitespace_document_number_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000084"),
            Guid.Parse("c2000000-0000-0000-0000-000000000084"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=%20%20%20");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_overlength_document_number_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000085"),
            Guid.Parse("c2000000-0000-0000-0000-000000000085"));
        var overlength = new string('A', 65);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber={overlength}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_document_number_with_Draft_status_and_created_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000086"),
            Guid.Parse("c2000000-0000-0000-0000-000000000086"));

        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "UAH");
        var match = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "UAH");
        var toIssue = await CreateIssuableInvoiceAsync(workspaceId, "INV-MATCH");
        var issueResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issueResponse.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&documentNumber=INV-MATCH");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_document_number_pages_after_filter()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000087"),
            Guid.Parse("c2000000-0000-0000-0000-000000000087"));

        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "UAH");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "UAH");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=INV-MATCH");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        Assert.Equal(3, baselineDoc.RootElement.GetProperty("totalCount").GetInt32());
        var ordered = baselineDoc.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, ordered.Length);

        var page1 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=1&documentNumber=INV-MATCH");
        var page2 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=2&pageSize=1&documentNumber=INV-MATCH");
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
    public async Task List_document_number_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000088"),
            Guid.Parse("c2000000-0000-0000-0000-000000000088"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000088"),
            Guid.Parse("d2000000-0000-0000-0000-000000000088"));

        var inA = await CreateInvoiceAsync(workspaceA, "INV-SCOPE", "cp", "UAH");
        await CreateInvoiceAsync(workspaceB, "INV-SCOPE", "cp", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices?page=1&pageSize=10&documentNumber=INV-SCOPE");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_document_number_trims_query_value()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000089"),
            Guid.Parse("c2000000-0000-0000-0000-000000000089"));
        var match = await CreateInvoiceAsync(workspaceId, "INV-TRIM", "cp", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=%20%20INV-TRIM%20%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_counterparty_reference_returns_only_matching()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000090"),
            Guid.Parse("c2000000-0000-0000-0000-000000000090"));

        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp-other", "UAH");
        var olderMatch = await CreateInvoiceAsync(workspaceId, "INV-A", "cp-match", "UAH");
        await Task.Delay(20);
        var newerMatch = await CreateInvoiceAsync(workspaceId, "INV-B", "cp-match", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-C", "Cp-Match", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference=cp-match");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(2, root.GetProperty("totalCount").GetInt32());
        var items = root.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(2, items.Length);
        Assert.Equal(newerMatch, items[0].GetProperty("id").GetGuid());
        Assert.Equal(olderMatch, items[1].GetProperty("id").GetGuid());
        Assert.All(items, item => Assert.Equal("cp-match", item.GetProperty("counterpartyReference").GetString()));
    }

    [Fact]
    public async Task List_omitted_counterparty_reference_returns_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000091"),
            Guid.Parse("c2000000-0000-0000-0000-000000000091"));

        await CreateInvoiceAsync(workspaceId, "INV-A", "cp-a", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-B", "cp-b", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task List_blank_counterparty_reference_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000092"),
            Guid.Parse("c2000000-0000-0000-0000-000000000092"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference=");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_whitespace_counterparty_reference_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000093"),
            Guid.Parse("c2000000-0000-0000-0000-000000000093"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference=%20%20%20");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_overlength_counterparty_reference_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000094"),
            Guid.Parse("c2000000-0000-0000-0000-000000000094"));
        var overlength = new string('A', 129);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference={overlength}");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_counterparty_reference_trims_query_value()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000095"),
            Guid.Parse("c2000000-0000-0000-0000-000000000095"));
        var match = await CreateInvoiceAsync(workspaceId, "INV-TRIM", "cp-trim", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference=%20%20cp-trim%20%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_counterparty_reference_with_Draft_status_and_created_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000096"),
            Guid.Parse("c2000000-0000-0000-0000-000000000096"));

        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp-other", "UAH");
        var match = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp-match", "UAH");
        var toIssue = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISSUE");
        var changeCp = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/change-counterparty",
            new { counterpartyReference = "cp-match" });
        Assert.Equal(HttpStatusCode.OK, changeCp.StatusCode);
        var issueResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issueResponse.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&counterpartyReference=cp-match");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_counterparty_reference_composes_with_document_number()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000097"),
            Guid.Parse("c2000000-0000-0000-0000-000000000097"));

        var match = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp-match", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp-other", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp-match", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=INV-MATCH&counterpartyReference=cp-match");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_counterparty_reference_pages_after_filter()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000098"),
            Guid.Parse("c2000000-0000-0000-0000-000000000098"));

        await CreateInvoiceAsync(workspaceId, "INV-1", "cp-match", "UAH");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-2", "cp-match", "UAH");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-3", "cp-match", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-4", "cp-other", "UAH");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference=cp-match");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        Assert.Equal(3, baselineDoc.RootElement.GetProperty("totalCount").GetInt32());
        var ordered = baselineDoc.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, ordered.Length);

        var page1 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=1&counterpartyReference=cp-match");
        var page2 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=2&pageSize=1&counterpartyReference=cp-match");
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
    public async Task List_counterparty_reference_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000099"),
            Guid.Parse("c2000000-0000-0000-0000-000000000099"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000099"),
            Guid.Parse("d2000000-0000-0000-0000-000000000099"));

        var inA = await CreateInvoiceAsync(workspaceA, "INV-A", "cp-scope", "UAH");
        await CreateInvoiceAsync(workspaceB, "INV-B", "cp-scope", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices?page=1&pageSize=10&counterpartyReference=cp-scope");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_currency_returns_only_matching()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a0"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a0"));

        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "EUR");
        var olderMatch = await CreateInvoiceAsync(workspaceId, "INV-A", "cp", "USD");
        await Task.Delay(20);
        var newerMatch = await CreateInvoiceAsync(workspaceId, "INV-B", "cp", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&currency=USD");
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
    public async Task List_omitted_currency_returns_all()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a1"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a1"));

        await CreateInvoiceAsync(workspaceId, "INV-A", "cp", "UAH");
        await CreateInvoiceAsync(workspaceId, "INV-B", "cp", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(2, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(2, document.RootElement.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task List_lowercase_currency_normalizes_and_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a2"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a2"));
        var match = await CreateInvoiceAsync(workspaceId, "INV-USD", "cp", "USD");
        await CreateInvoiceAsync(workspaceId, "INV-EUR", "cp", "EUR");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&currency=usd");
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
    public async Task List_blank_currency_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a3"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a3"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&currency=");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_whitespace_currency_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a4"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a4"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&currency=%20%20%20");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_currency_trims_query_value()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a5"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a5"));
        var match = await CreateInvoiceAsync(workspaceId, "INV-TRIM", "cp", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&currency=%20%20USD%20%20");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_currency_with_Draft_status_and_created_range()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a6"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a6"));

        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "EUR");
        var match = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "USD");
        var toIssue = await CreateIssuableInvoiceAsync(workspaceId, "INV-ISSUE");
        var changeCurrency = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/change-currency",
            new { currency = "usd" });
        Assert.Equal(HttpStatusCode.OK, changeCurrency.StatusCode);
        var issueResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issueResponse.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_currency_composes_with_document_number()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a7"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a7"));

        var match = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "USD");
        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp", "EUR");
        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&documentNumber=INV-MATCH&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_currency_composes_with_counterparty_reference()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a8"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a8"));

        var match = await CreateInvoiceAsync(workspaceId, "INV-A", "cp-match", "USD");
        await CreateInvoiceAsync(workspaceId, "INV-B", "cp-match", "EUR");
        await CreateInvoiceAsync(workspaceId, "INV-C", "cp-other", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&counterpartyReference=cp-match&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_currency_with_all_current_filters()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000a9"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000a9"));

        var match = await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp-match", "USD");
        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp-match", "EUR");
        await CreateInvoiceAsync(workspaceId, "INV-MATCH", "cp-other", "USD");
        await CreateInvoiceAsync(workspaceId, "INV-OTHER", "cp-match", "USD");
        var toIssue = await CreateIssuableInvoiceAsync(workspaceId, "INV-MATCH");
        var changeCp = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/change-counterparty",
            new { counterpartyReference = "cp-match" });
        Assert.Equal(HttpStatusCode.OK, changeCp.StatusCode);
        var changeCurrency = await _client.PostAsJsonAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/change-currency",
            new { currency = "usd" });
        Assert.Equal(HttpStatusCode.OK, changeCurrency.StatusCode);
        var issueResponse = await _client.PostAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{toIssue}/issue",
            null);
        Assert.Equal(HttpStatusCode.OK, issueResponse.StatusCode);

        var from = Uri.EscapeDataString(new DateTimeOffset(2000, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var to = Uri.EscapeDataString(new DateTimeOffset(2100, 1, 1, 0, 0, 0, TimeSpan.Zero).ToString("o"));
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&status=Draft&createdFromUtc={from}&createdToUtc={to}&documentNumber=INV-MATCH&counterpartyReference=cp-match&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            match,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_currency_pages_after_filter()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000aa"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000aa"));

        await CreateInvoiceAsync(workspaceId, "INV-1", "cp", "USD");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-2", "cp", "USD");
        await Task.Delay(20);
        await CreateInvoiceAsync(workspaceId, "INV-3", "cp", "USD");
        await CreateInvoiceAsync(workspaceId, "INV-4", "cp", "EUR");

        var baseline = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10&currency=USD");
        using var baselineDoc = JsonDocument.Parse(await baseline.Content.ReadAsStringAsync());
        Assert.Equal(3, baselineDoc.RootElement.GetProperty("totalCount").GetInt32());
        var ordered = baselineDoc.RootElement.GetProperty("items").EnumerateArray().ToArray();
        Assert.Equal(3, ordered.Length);

        var page1 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=1&currency=USD");
        var page2 = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=2&pageSize=1&currency=USD");
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
    public async Task List_currency_is_workspace_scoped()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-0000000000ab"),
            Guid.Parse("c2000000-0000-0000-0000-0000000000ab"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-0000000000ab"),
            Guid.Parse("d2000000-0000-0000-0000-0000000000ab"));

        var inA = await CreateInvoiceAsync(workspaceA, "INV-A", "cp", "USD");
        await CreateInvoiceAsync(workspaceB, "INV-B", "cp", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices?page=1&pageSize=10&currency=USD");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(1, document.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(
            inA,
            Assert.Single(document.RootElement.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Get_by_id_still_resolves_after_list_route()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000022"),
            Guid.Parse("c2000000-0000-0000-0000-000000000022"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-GET-LIST", "cp-get", "EUR");

        var list = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(invoiceId, document.RootElement.GetProperty("id").GetGuid());
        Assert.Equal("INV-GET-LIST", document.RootElement.GetProperty("documentNumber").GetString());
    }

    [Fact]
    public async Task List_by_document_number_returns_matching_invoices_newest_first()
    {
        var workspaceA = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000040"),
            Guid.Parse("c2000000-0000-0000-0000-000000000040"));
        var workspaceB = await CreateWorkspaceAsync(
            Guid.Parse("d1000000-0000-0000-0000-000000000040"),
            Guid.Parse("d2000000-0000-0000-0000-000000000040"));

        var older = await CreateInvoiceAsync(workspaceA, "INV-DUP", "cp-old", "UAH");
        await Task.Delay(20);
        var newer = await CreateInvoiceAsync(workspaceA, "INV-DUP", "cp-new", "UAH");
        await CreateInvoiceAsync(workspaceA, "INV-OTHER", "cp-other", "UAH");
        await CreateInvoiceAsync(workspaceA, "inv-dup", "cp-case", "UAH");
        await CreateInvoiceAsync(workspaceB, "INV-DUP", "cp-b", "USD");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceA}/invoices/by-document-number?documentNumber=INV-DUP");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, document.RootElement.ValueKind);
        Assert.Equal(2, document.RootElement.GetArrayLength());
        Assert.Equal(newer, document.RootElement[0].GetProperty("id").GetGuid());
        Assert.Equal(older, document.RootElement[1].GetProperty("id").GetGuid());
        Assert.Equal("INV-DUP", document.RootElement[0].GetProperty("documentNumber").GetString());
        Assert.True(document.RootElement[0].TryGetProperty("createdAtUtc", out _));
        Assert.True(document.RootElement[0].TryGetProperty("lines", out _));
    }

    [Fact]
    public async Task List_by_document_number_empty_returns_200_with_empty_array()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000041"),
            Guid.Parse("c2000000-0000-0000-0000-000000000041"));
        await CreateInvoiceAsync(workspaceId, "INV-A", "cp", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/by-document-number?documentNumber=INV-MISSING");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Array, document.RootElement.ValueKind);
        Assert.Equal(0, document.RootElement.GetArrayLength());
    }

    [Fact]
    public async Task List_by_document_number_binds_encoded_spaces_and_punctuation()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000042"),
            Guid.Parse("c2000000-0000-0000-0000-000000000042"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV 2026/07", "cp", "UAH");

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/by-document-number?documentNumber=INV%202026%2F07");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(invoiceId, Assert.Single(document.RootElement.EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal("INV 2026/07", document.RootElement[0].GetProperty("documentNumber").GetString());
    }

    [Fact]
    public async Task List_by_document_number_missing_parameter_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000043"),
            Guid.Parse("c2000000-0000-0000-0000-000000000043"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/by-document-number");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_by_document_number_blank_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000044"),
            Guid.Parse("c2000000-0000-0000-0000-000000000044"));

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/by-document-number?documentNumber=%20%20%20");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_by_document_number_overlength_returns_400()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000045"),
            Guid.Parse("c2000000-0000-0000-0000-000000000045"));
        var overlength = new string('A', 65);

        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/by-document-number?documentNumber={overlength}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_by_document_number_empty_finance_workspace_id_returns_400()
    {
        var response = await _client.GetAsync(
            $"/api/finance-workspaces/{Guid.Empty}/invoices/by-document-number?documentNumber=INV-1");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertErrorAsync(response, "ValidationFailed");
    }

    [Fact]
    public async Task List_and_get_by_id_still_resolve_after_by_document_number_route()
    {
        var workspaceId = await CreateWorkspaceAsync(
            Guid.Parse("c1000000-0000-0000-0000-000000000046"),
            Guid.Parse("c2000000-0000-0000-0000-000000000046"));
        var invoiceId = await CreateInvoiceAsync(workspaceId, "INV-KEEP", "cp", "UAH");

        var byNumber = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/by-document-number?documentNumber=INV-KEEP");
        Assert.Equal(HttpStatusCode.OK, byNumber.StatusCode);

        var list = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices?page=1&pageSize=10");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var listDocument = JsonDocument.Parse(await list.Content.ReadAsStringAsync());
        Assert.Equal(1, listDocument.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, listDocument.RootElement.GetProperty("items").GetArrayLength());

        var get = await _client.GetAsync(
            $"/api/finance-workspaces/{workspaceId}/invoices/{invoiceId}");
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        using var getDocument = JsonDocument.Parse(await get.Content.ReadAsStringAsync());
        Assert.Equal(invoiceId, getDocument.RootElement.GetProperty("id").GetGuid());
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
        Assert.Contains(
            "/api/finance-workspaces/{financeWorkspaceId}/invoices/by-document-number",
            json);
        Assert.Contains("CreateInvoice", json);
        Assert.Contains("ListInvoices", json);
        Assert.Contains("ListInvoicesByDocumentNumber", json);
        Assert.Contains("IssueInvoice", json);
        Assert.Contains("GetInvoiceById", json);
        Assert.Contains("documentNumber", json);
        Assert.Contains("counterpartyReference", json);
        Assert.Contains("pageSize", json);
        Assert.Contains("status", json);
        Assert.Contains("createdFromUtc", json);
        Assert.Contains("createdToUtc", json);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "\"ListInvoices\""));
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(json, "\"ListInvoicesByDocumentNumber\""));
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

    private async Task<Guid> CreateIssuableInvoiceAsync(Guid workspaceId, string documentNumber = "INV-READY")
    {
        var invoiceId = await CreateInvoiceAsync(workspaceId, documentNumber, "cp", "UAH");
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
