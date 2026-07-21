using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application;
using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Invoices;
using VectorFlow.Finance.Application.Invoices.Commands;
using VectorFlow.Finance.Application.Invoices.Handlers;
using VectorFlow.Finance.Application.Invoices.Queries;
using VectorFlow.Finance.Application.Tests.Workspaces;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Application.Tests.Invoices;

public sealed class InvoiceApplicationTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 11, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset DueNextDay =
        new(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);

    private static readonly Guid OrganizationId =
        Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");

    private static readonly Guid PlatformWorkspaceId =
        Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222");

    private static (
        InMemoryInvoiceRepository Invoices,
        InMemoryFinanceWorkspaceRepository Workspaces,
        FixedClock Clock) CreateHarness()
    {
        var invoices = new InMemoryInvoiceRepository();
        var workspaces = new InMemoryFinanceWorkspaceRepository();
        var clock = new FixedClock(T0);
        return (invoices, workspaces, clock);
    }

    private static async Task<Guid> SeedWorkspaceAsync(
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid? organizationId = null,
        Guid? platformWorkspaceId = null,
        string name = "Primary Finance")
    {
        var result = await new CreateFinanceWorkspaceHandler(workspaces, clock).HandleAsync(
            new CreateFinanceWorkspaceCommand(
                organizationId ?? OrganizationId,
                platformWorkspaceId ?? PlatformWorkspaceId,
                name,
                "UAH"));

        Assert.True(result.IsSuccess);
        return result.Value!.Id;
    }

    private static async Task<InvoiceDto> CreateInvoiceAsync(
        InMemoryInvoiceRepository invoices,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId,
        string documentNumber = "INV-1001",
        string counterparty = "crm-partner-1",
        string currency = "UAH")
    {
        var result = await new CreateInvoiceHandler(invoices, workspaces, clock).HandleAsync(
            new CreateInvoiceCommand(workspaceId, documentNumber, counterparty, currency));

        Assert.True(result.IsSuccess);
        return result.Value!;
    }

    private static async Task<InvoiceDto> CreateIssuableAsync(
        InMemoryInvoiceRepository invoices,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId)
    {
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var withLine = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 2m, 50m, "Service"));
        Assert.True(withLine.IsSuccess);

        var withDue = await new SetInvoiceDueDateHandler(invoices, clock).HandleAsync(
            new SetInvoiceDueDateCommand(workspaceId, created.Id, DueNextDay));
        Assert.True(withDue.IsSuccess);
        return withDue.Value!;
    }

    [Fact]
    public async Task Create_returns_draft_dto_and_persists_once()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateInvoiceHandler(invoices, workspaces, clock).HandleAsync(
            new CreateInvoiceCommand(workspaceId, "  INV-42  ", "  partner-7  ", "eur"));

        Assert.True(result.IsSuccess);
        Assert.Equal(workspaceId, result.Value!.FinanceWorkspaceId);
        Assert.Equal("INV-42", result.Value.DocumentNumber);
        Assert.Equal("partner-7", result.Value.CounterpartyReference);
        Assert.Equal("EUR", result.Value.Currency);
        Assert.Equal(nameof(InvoiceStatus.Draft), result.Value.Status);
        Assert.Equal(T0, result.Value.CreatedAtUtc);
        Assert.Equal(T0, result.Value.UpdatedAtUtc);
        Assert.Null(result.Value.DueDateUtc);
        Assert.Null(result.Value.IssuedAtUtc);
        Assert.Empty(result.Value.Lines);
        Assert.Equal(0m, result.Value.TotalAmount);
        Assert.NotEqual(Guid.Empty, result.Value.Id);
        Assert.Equal(1, invoices.AddCallCount);
        Assert.Equal(1, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_rejects_missing_workspace_without_persist()
    {
        var (invoices, workspaces, clock) = CreateHarness();

        var result = await new CreateInvoiceHandler(invoices, workspaces, clock).HandleAsync(
            new CreateInvoiceCommand(Guid.NewGuid(), "INV-1", "partner", "UAH"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, invoices.AddCallCount);
        Assert.Equal(0, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_domain_validation_failure_does_not_persist()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateInvoiceHandler(invoices, workspaces, clock).HandleAsync(
            new CreateInvoiceCommand(workspaceId, "   ", "partner", "UAH"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.AddCallCount);
        Assert.Equal(0, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Get_returns_invoice_from_same_workspace()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        var savesBefore = invoices.SaveChangesCallCount;

        var result = await new GetInvoiceHandler(invoices).HandleAsync(
            new GetInvoiceByIdQuery(workspaceId, created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(created.Id, result.Value!.Id);
        Assert.Equal(savesBefore, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Get_wrong_workspace_returns_NotFound()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA);

        var result = await new GetInvoiceHandler(invoices).HandleAsync(
            new GetInvoiceByIdQuery(workspaceB, created.Id));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Invoice was not found.", result.ErrorMessage);
    }

    [Fact]
    public async Task List_empty_workspace_returns_empty_list()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesHandler(invoices).HandleAsync(
            new GetInvoicesQuery(workspaceId));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!);
        Assert.Equal(1, invoices.ListByWorkspaceCallCount);
        Assert.Equal(workspaceId, invoices.LastListedWorkspaceId!.Value.Value);
    }

    [Fact]
    public async Task List_returns_only_requested_workspace_newest_first()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        clock.UtcNow = T0;
        var older = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-OLD");
        clock.UtcNow = T1;
        var newer = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-NEW");
        clock.UtcNow = T2;
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceB, "INV-OTHER");

        var result = await new GetInvoicesHandler(invoices).HandleAsync(
            new GetInvoicesQuery(workspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(newer.Id, result.Value[0].Id);
        Assert.Equal(older.Id, result.Value[1].Id);
        Assert.Equal(workspaceA, invoices.LastListedWorkspaceId!.Value.Value);
    }

    [Fact]
    public async Task List_maps_invoice_dto_fields()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        clock.UtcNow = T0;
        var created = await CreateInvoiceAsync(
            invoices,
            workspaces,
            clock,
            workspaceId,
            "INV-DTO",
            "cp-dto",
            "USD");
        clock.UtcNow = T1;
        var withLine = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 2m, 25m, "Item"));
        Assert.True(withLine.IsSuccess);

        var result = await new GetInvoicesHandler(invoices).HandleAsync(
            new GetInvoicesQuery(workspaceId));

        Assert.True(result.IsSuccess);
        var dto = Assert.Single(result.Value!);
        Assert.Equal(created.Id, dto.Id);
        Assert.Equal(workspaceId, dto.FinanceWorkspaceId);
        Assert.Equal("INV-DTO", dto.DocumentNumber);
        Assert.Equal("cp-dto", dto.CounterpartyReference);
        Assert.Equal("USD", dto.Currency);
        Assert.Equal(nameof(InvoiceStatus.Draft), dto.Status);
        Assert.Equal(50m, dto.TotalAmount);
        Assert.Equal(T0, dto.CreatedAtUtc);
        Assert.Equal(T1, dto.UpdatedAtUtc);
        Assert.Null(dto.DueDateUtc);
        Assert.Null(dto.IssuedAtUtc);
        var line = Assert.Single(dto.Lines);
        Assert.Equal(2m, line.Quantity);
        Assert.Equal(25m, line.UnitPrice);
        Assert.Equal(50m, line.LineAmount);
        Assert.Equal("Item", line.Description);
    }

    [Fact]
    public async Task List_rejects_empty_workspace_id()
    {
        var (invoices, _, _) = CreateHarness();

        var result = await new GetInvoicesHandler(invoices).HandleAsync(
            new GetInvoicesQuery(Guid.Empty));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListByWorkspaceCallCount);
    }

    [Fact]
    public async Task ListPaged_returns_page_with_total_count()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        clock.UtcNow = T0;
        var older = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-OLD");
        clock.UtcNow = T1;
        var newer = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-NEW");
        clock.UtcNow = T2;
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceB, "INV-OTHER");

        using var cts = new CancellationTokenSource();
        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceA, Page: 1, PageSize: 10),
            cts.Token);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.Page);
        Assert.Equal(10, result.Value.PageSize);
        Assert.Equal(2, result.Value.TotalCount);
        Assert.Equal(2, result.Value.Items.Count);
        Assert.Equal(newer.Id, result.Value.Items[0].Id);
        Assert.Equal(older.Id, result.Value.Items[1].Id);
        Assert.Equal(1, invoices.ListPagedCallCount);
        Assert.Equal(workspaceA, invoices.LastListedWorkspaceId!.Value.Value);
        Assert.Equal(1, invoices.LastListedPage);
        Assert.Equal(10, invoices.LastListedPageSize);
        Assert.Null(invoices.LastListedStatus);
        Assert.Equal(cts.Token, invoices.LastListPagedCancellationToken);
    }

    [Fact]
    public async Task ListPaged_empty_returns_empty_items_with_zero_total()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 20));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Equal(0, result.Value.TotalCount);
        Assert.Equal(1, result.Value.Page);
        Assert.Equal(20, result.Value.PageSize);
        Assert.Equal(1, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_multiple_pages_preserve_order_and_total()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var first = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-1");
        clock.UtcNow = T1;
        var second = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-2");
        clock.UtcNow = T2;
        var third = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-3");

        var page1 = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 2));
        var page2 = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 2, PageSize: 2));

        Assert.True(page1.IsSuccess);
        Assert.Equal(3, page1.Value!.TotalCount);
        Assert.Equal(2, page1.Value.Items.Count);
        Assert.Equal(third.Id, page1.Value.Items[0].Id);
        Assert.Equal(second.Id, page1.Value.Items[1].Id);

        Assert.True(page2.IsSuccess);
        Assert.Equal(3, page2.Value!.TotalCount);
        Assert.Equal(first.Id, Assert.Single(page2.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_rejects_page_below_one()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 0, PageSize: 10));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_page_size_below_one()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_page_size_above_max()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: GetInvoicesPagedHandler.MaxPageSize + 1));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_empty_workspace_id()
    {
        var (invoices, _, _) = CreateHarness();

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(Guid.Empty, Page: 1, PageSize: 10));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_missing_status_passes_null_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-DRAFT");

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, invoices.ListPagedCallCount);
        Assert.Null(invoices.LastListedStatus);
        Assert.Null(invoices.LastListedCreatedFromUtc);
        Assert.Null(invoices.LastListedCreatedToUtc);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_status_Draft_passes_Draft_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var draft = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-DRAFT");
        var ready = await CreateIssuableAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        await new IssueInvoiceHandler(invoices, clock).HandleAsync(
            new IssueInvoiceCommand(workspaceId, ready.Id));

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Draft"));

        Assert.True(result.IsSuccess);
        Assert.Equal(InvoiceStatus.Draft, invoices.LastListedStatus);
        Assert.Equal(draft.Id, Assert.Single(result.Value!.Items).Id);
        Assert.Equal(1, result.Value.TotalCount);
        Assert.Equal(nameof(InvoiceStatus.Draft), result.Value.Items[0].Status);
    }

    [Fact]
    public async Task ListPaged_status_Issued_passes_Issued_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-DRAFT");
        var ready = await CreateIssuableAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        var issued = await new IssueInvoiceHandler(invoices, clock).HandleAsync(
            new IssueInvoiceCommand(workspaceId, ready.Id));
        Assert.True(issued.IsSuccess);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Issued"));

        Assert.True(result.IsSuccess);
        Assert.Equal(InvoiceStatus.Issued, invoices.LastListedStatus);
        Assert.Equal(issued.Value!.Id, Assert.Single(result.Value!.Items).Id);
        Assert.Equal(1, result.Value.TotalCount);
        Assert.Equal(nameof(InvoiceStatus.Issued), result.Value.Items[0].Status);
    }

    [Fact]
    public async Task ListPaged_explicit_blank_status_returns_ValidationFailed()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: ""));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_whitespace_status_returns_ValidationFailed()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_unknown_status_Paid_returns_ValidationFailed()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Paid"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_lowercase_status_returns_ValidationFailed()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "draft"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_numeric_status_returns_ValidationFailed()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "0"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_padded_status_returns_ValidationFailed_without_repository_call()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: " Draft "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_status_filter_empty_match_returns_empty_page()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-DRAFT");

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Issued"));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Equal(0, result.Value.TotalCount);
        Assert.Equal(1, result.Value.Page);
        Assert.Equal(10, result.Value.PageSize);
        Assert.Equal(InvoiceStatus.Issued, invoices.LastListedStatus);
    }

    [Fact]
    public async Task ListPaged_omitted_created_bounds_pass_null_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-1");

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(invoices.LastListedCreatedFromUtc);
        Assert.Null(invoices.LastListedCreatedToUtc);
        Assert.Null(invoices.LastListedStatus);
    }

    [Fact]
    public async Task ListPaged_created_from_only_passes_bound_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var from = T1;

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, CreatedFromUtc: from));

        Assert.True(result.IsSuccess);
        Assert.Equal(from, invoices.LastListedCreatedFromUtc);
        Assert.Null(invoices.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_created_to_only_passes_bound_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var to = T1;

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(workspaceId, Page: 1, PageSize: 10, CreatedToUtc: to));

        Assert.True(result.IsSuccess);
        Assert.Null(invoices.LastListedCreatedFromUtc);
        Assert.Equal(to, invoices.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_created_both_bounds_pass_to_repository()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                CreatedFromUtc: T0,
                CreatedToUtc: T2));

        Assert.True(result.IsSuccess);
        Assert.Equal(T0, invoices.LastListedCreatedFromUtc);
        Assert.Equal(T2, invoices.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_equal_created_bounds_are_accepted()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                CreatedFromUtc: T1,
                CreatedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, invoices.LastListedCreatedFromUtc);
        Assert.Equal(T1, invoices.LastListedCreatedToUtc);
        Assert.Equal(1, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_created_from_after_to_returns_ValidationFailed()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                CreatedFromUtc: T2,
                CreatedToUtc: T0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_created_range_with_status_forwards_both()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesPagedHandler(invoices).HandleAsync(
            new GetInvoicesPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2));

        Assert.True(result.IsSuccess);
        Assert.Equal(InvoiceStatus.Draft, invoices.LastListedStatus);
        Assert.Equal(T0, invoices.LastListedCreatedFromUtc);
        Assert.Equal(T2, invoices.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListByDocumentNumber_returns_all_matching_newest_first()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        clock.UtcNow = T0;
        var older = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-DUP");
        clock.UtcNow = T1;
        var newer = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-DUP");
        clock.UtcNow = T2;
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceA, "INV-OTHER");
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceB, "INV-DUP");

        using var cts = new CancellationTokenSource();
        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceA, "INV-DUP"),
            cts.Token);

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(newer.Id, result.Value[0].Id);
        Assert.Equal(older.Id, result.Value[1].Id);
        Assert.Equal(1, invoices.ListByDocumentNumberCallCount);
        Assert.Equal(workspaceA, invoices.LastListedWorkspaceId!.Value.Value);
        Assert.Equal("INV-DUP", invoices.LastListedDocumentNumber);
        Assert.Equal(cts.Token, invoices.LastListByDocumentNumberCancellationToken);
    }

    [Fact]
    public async Task ListByDocumentNumber_empty_returns_empty_list()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-A");

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, "INV-MISSING"));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!);
        Assert.Equal(1, invoices.ListByDocumentNumberCallCount);
    }

    [Fact]
    public async Task ListByDocumentNumber_case_variation_does_not_match()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-Case");

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, "inv-case"));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!);
    }

    [Fact]
    public async Task ListByDocumentNumber_trims_input_whitespace()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId, "INV-TRIM");

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, "  INV-TRIM  "));

        Assert.True(result.IsSuccess);
        Assert.Equal(created.Id, Assert.Single(result.Value!).Id);
        Assert.Equal("INV-TRIM", invoices.LastListedDocumentNumber);
    }

    [Fact]
    public async Task ListByDocumentNumber_equal_created_at_orders_by_id_descending()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var workspace = new FinanceWorkspaceId(workspaceId);
        var lowerId = new InvoiceId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var higherId = new InvoiceId(Guid.Parse("99999999-9999-9999-9999-999999999999"));

        await invoices.AddAsync(Invoice.Create(
            lowerId,
            workspace,
            "INV-TIE",
            new CounterpartyReference("cp-a"),
            new Currency("UAH"),
            T0));
        await invoices.AddAsync(Invoice.Create(
            higherId,
            workspace,
            "INV-TIE",
            new CounterpartyReference("cp-b"),
            new Currency("UAH"),
            T0));

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, "INV-TIE"));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(higherId.Value, result.Value[0].Id);
        Assert.Equal(lowerId.Value, result.Value[1].Id);
    }

    [Fact]
    public async Task ListByDocumentNumber_maps_invoice_dto_fields()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        clock.UtcNow = T0;
        var created = await CreateInvoiceAsync(
            invoices, workspaces, clock, workspaceId, "INV-MAP", "cp-map", "USD");
        clock.UtcNow = T1;
        var withLine = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 2m, 25m, "Item"));
        Assert.True(withLine.IsSuccess);

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, "INV-MAP"));

        Assert.True(result.IsSuccess);
        var dto = Assert.Single(result.Value!);
        Assert.Equal(created.Id, dto.Id);
        Assert.Equal(workspaceId, dto.FinanceWorkspaceId);
        Assert.Equal("INV-MAP", dto.DocumentNumber);
        Assert.Equal("cp-map", dto.CounterpartyReference);
        Assert.Equal("USD", dto.Currency);
        Assert.Equal(nameof(InvoiceStatus.Draft), dto.Status);
        Assert.Equal(50m, dto.TotalAmount);
        Assert.Equal(T0, dto.CreatedAtUtc);
        Assert.Equal(T1, dto.UpdatedAtUtc);
        var line = Assert.Single(dto.Lines);
        Assert.Equal("Item", line.Description);
    }

    [Fact]
    public async Task ListByDocumentNumber_rejects_blank_document_number()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListByDocumentNumberCallCount);
    }

    [Fact]
    public async Task ListByDocumentNumber_rejects_overlength_document_number()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var overlength = new string('A', Invoice.DocumentNumberMaxLength + 1);

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(workspaceId, overlength));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListByDocumentNumberCallCount);
    }

    [Fact]
    public async Task ListByDocumentNumber_rejects_empty_workspace_id()
    {
        var (invoices, _, _) = CreateHarness();

        var result = await new GetInvoicesByDocumentNumberHandler(invoices).HandleAsync(
            new GetInvoicesByDocumentNumberQuery(Guid.Empty, "INV-1"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, invoices.ListByDocumentNumberCallCount);
    }

    [Fact]
    public async Task ChangeDocumentNumber_updates_and_saves_once()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var savesBefore = invoices.SaveChangesCallCount;

        var result = await new ChangeInvoiceDocumentNumberHandler(invoices, clock).HandleAsync(
            new ChangeInvoiceDocumentNumberCommand(workspaceId, created.Id, " INV-9 "));

        Assert.True(result.IsSuccess);
        Assert.Equal("INV-9", result.Value!.DocumentNumber);
        Assert.Equal(T1, result.Value.UpdatedAtUtc);
        Assert.Equal(savesBefore + 1, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task ChangeCounterparty_updates_reference()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ChangeInvoiceCounterpartyHandler(invoices, clock).HandleAsync(
            new ChangeInvoiceCounterpartyCommand(workspaceId, created.Id, "partner-9"));

        Assert.True(result.IsSuccess);
        Assert.Equal("partner-9", result.Value!.CounterpartyReference);
    }

    [Fact]
    public async Task ChangeCurrency_updates_currency()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ChangeInvoiceCurrencyHandler(invoices, clock).HandleAsync(
            new ChangeInvoiceCurrencyCommand(workspaceId, created.Id, "usd"));

        Assert.True(result.IsSuccess);
        Assert.Equal("USD", result.Value!.Currency);
    }

    [Fact]
    public async Task SetDueDate_updates_due_date()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new SetInvoiceDueDateHandler(invoices, clock).HandleAsync(
            new SetInvoiceDueDateCommand(workspaceId, created.Id, DueNextDay));

        Assert.True(result.IsSuccess);
        Assert.Equal(DueNextDay, result.Value!.DueDateUtc);
    }

    [Fact]
    public async Task AddLine_updates_total_and_ordering()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var first = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 1m, 10.5m, "  A  "));
        Assert.True(first.IsSuccess);

        var second = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 2m, 3m, "B"));

        Assert.True(second.IsSuccess);
        Assert.Equal(2, second.Value!.Lines.Count);
        Assert.Equal(1, second.Value.Lines[0].Sequence);
        Assert.Equal(2, second.Value.Lines[1].Sequence);
        Assert.Equal("A", second.Value.Lines[0].Description);
        Assert.Equal(10.5m, second.Value.Lines[0].LineAmount);
        Assert.Equal(16.5m, second.Value.TotalAmount);
    }

    [Fact]
    public async Task UpdateLine_replaces_amounts()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var withLine = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 1m, 10m, "Old"));
        var lineId = withLine.Value!.Lines[0].Id;
        clock.UtcNow = T2;

        var result = await new UpdateInvoiceLineHandler(invoices, clock).HandleAsync(
            new UpdateInvoiceLineCommand(workspaceId, created.Id, lineId, 3m, 4m, "New"));

        Assert.True(result.IsSuccess);
        Assert.Equal(12m, result.Value!.TotalAmount);
        Assert.Equal(3m, result.Value.Lines[0].Quantity);
        Assert.Equal(4m, result.Value.Lines[0].UnitPrice);
        Assert.Equal("New", result.Value.Lines[0].Description);
    }

    [Fact]
    public async Task RemoveLine_updates_total()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 1m, 10m, null));
        var withTwo = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 1m, 5m, null));
        var dropId = withTwo.Value!.Lines[1].Id;

        var result = await new RemoveInvoiceLineHandler(invoices, clock).HandleAsync(
            new RemoveInvoiceLineCommand(workspaceId, created.Id, dropId));

        Assert.True(result.IsSuccess);
        Assert.Single(result.Value!.Lines);
        Assert.Equal(10m, result.Value.TotalAmount);
    }

    [Fact]
    public async Task Mutation_missing_invoice_returns_NotFound_without_save()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new ChangeInvoiceDocumentNumberHandler(invoices, clock).HandleAsync(
            new ChangeInvoiceDocumentNumberCommand(workspaceId, Guid.NewGuid(), "INV-X"));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task AddLine_validation_failure_does_not_save()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        var savesBefore = invoices.SaveChangesCallCount;
        clock.UtcNow = T1;

        var result = await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 0m, 10m, null));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(savesBefore, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Update_missing_line_returns_Conflict_without_save()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateInvoiceAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
            new AddInvoiceLineCommand(workspaceId, created.Id, 1m, 10m, null));
        var savesBefore = invoices.SaveChangesCallCount;

        var result = await new UpdateInvoiceLineHandler(invoices, clock).HandleAsync(
            new UpdateInvoiceLineCommand(workspaceId, created.Id, Guid.NewGuid(), 1m, 5m, null));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(savesBefore, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Issue_succeeds_and_maps_issued_state()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var ready = await CreateIssuableAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        var savesBefore = invoices.SaveChangesCallCount;

        var result = await new IssueInvoiceHandler(invoices, clock).HandleAsync(
            new IssueInvoiceCommand(workspaceId, ready.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(InvoiceStatus.Issued), result.Value!.Status);
        Assert.Equal(T2, result.Value.IssuedAtUtc);
        Assert.Equal(T2, result.Value.UpdatedAtUtc);
        Assert.Equal(savesBefore + 1, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Issue_repeated_returns_Conflict_without_save()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var ready = await CreateIssuableAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        await new IssueInvoiceHandler(invoices, clock).HandleAsync(
            new IssueInvoiceCommand(workspaceId, ready.Id));
        var savesBefore = invoices.SaveChangesCallCount;

        var result = await new IssueInvoiceHandler(invoices, clock).HandleAsync(
            new IssueInvoiceCommand(workspaceId, ready.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(savesBefore, invoices.SaveChangesCallCount);
    }

    [Fact]
    public async Task Issued_invoice_rejects_mutations_as_Conflict()
    {
        var (invoices, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var ready = await CreateIssuableAsync(invoices, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        await new IssueInvoiceHandler(invoices, clock).HandleAsync(
            new IssueInvoiceCommand(workspaceId, ready.Id));
        var later = T2.AddHours(1);
        clock.UtcNow = later;
        var savesBefore = invoices.SaveChangesCallCount;
        var lineId = ready.Lines[0].Id;

        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new ChangeInvoiceDocumentNumberHandler(invoices, clock).HandleAsync(
                new ChangeInvoiceDocumentNumberCommand(workspaceId, ready.Id, "X"))).ErrorKind);
        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new ChangeInvoiceCounterpartyHandler(invoices, clock).HandleAsync(
                new ChangeInvoiceCounterpartyCommand(workspaceId, ready.Id, "other"))).ErrorKind);
        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new ChangeInvoiceCurrencyHandler(invoices, clock).HandleAsync(
                new ChangeInvoiceCurrencyCommand(workspaceId, ready.Id, "USD"))).ErrorKind);
        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new SetInvoiceDueDateHandler(invoices, clock).HandleAsync(
                new SetInvoiceDueDateCommand(workspaceId, ready.Id, DueNextDay.AddDays(1)))).ErrorKind);
        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new AddInvoiceLineHandler(invoices, clock).HandleAsync(
                new AddInvoiceLineCommand(workspaceId, ready.Id, 1m, 1m, null))).ErrorKind);
        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new UpdateInvoiceLineHandler(invoices, clock).HandleAsync(
                new UpdateInvoiceLineCommand(workspaceId, ready.Id, lineId, 1m, 1m, null))).ErrorKind);
        Assert.Equal(
            ApplicationErrorKind.Conflict,
            (await new RemoveInvoiceLineHandler(invoices, clock).HandleAsync(
                new RemoveInvoiceLineCommand(workspaceId, ready.Id, lineId))).ErrorKind);

        Assert.Equal(savesBefore, invoices.SaveChangesCallCount);
    }

    [Fact]
    public void AddFinanceInvoiceApplication_registers_handlers()
    {
        var services = new ServiceCollection();
        services.AddFinanceInvoiceApplication();

        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(CreateInvoiceHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetInvoiceHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetInvoicesHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetInvoicesPagedHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetInvoicesByDocumentNumberHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(IssueInvoiceHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(AddInvoiceLineHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(UpdateInvoiceLineHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(RemoveInvoiceLineHandler));
    }
}
