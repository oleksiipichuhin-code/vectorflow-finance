using Microsoft.Extensions.DependencyInjection;
using VectorFlow.Finance.Application;
using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Application.Accruals;
using VectorFlow.Finance.Application.Accruals.Commands;
using VectorFlow.Finance.Application.Accruals.Handlers;
using VectorFlow.Finance.Application.Accruals.Queries;
using VectorFlow.Finance.Application.Tests.Workspaces;
using VectorFlow.Finance.Application.Workspaces.Commands;
using VectorFlow.Finance.Application.Workspaces.Handlers;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Application.Tests.Accruals;

public sealed class AccrualApplicationTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 20, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 20, 11, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset RecognitionDate =
        new(2026, 7, 15, 0, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset RecognitionDateAlt =
        new(2026, 8, 1, 0, 0, 0, TimeSpan.Zero);

    private static readonly Guid OrganizationId =
        Guid.Parse("aaaaaaaa-1111-1111-1111-111111111111");

    private static readonly Guid PlatformWorkspaceId =
        Guid.Parse("bbbbbbbb-2222-2222-2222-222222222222");

    private static readonly Guid SourceInvoiceId =
        Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static (
        InMemoryAccrualRepository Accruals,
        InMemoryFinanceWorkspaceRepository Workspaces,
        FixedClock Clock) CreateHarness()
    {
        var accruals = new InMemoryAccrualRepository();
        var workspaces = new InMemoryFinanceWorkspaceRepository();
        var clock = new FixedClock(T0);
        return (accruals, workspaces, clock);
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

    private static async Task<AccrualDto> CreateAccrualAsync(
        InMemoryAccrualRepository accruals,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId,
        string type = "Revenue",
        decimal amount = 100m,
        string currency = "UAH",
        DateTimeOffset? recognitionDate = null,
        string description = "Monthly recognition",
        Guid? sourceInvoiceId = null)
    {
        var result = await new CreateAccrualHandler(accruals, workspaces, clock).HandleAsync(
            new CreateAccrualCommand(
                workspaceId,
                type,
                amount,
                currency,
                recognitionDate ?? RecognitionDate,
                description,
                sourceInvoiceId));

        Assert.True(result.IsSuccess);
        return result.Value!;
    }

    private static async Task<AccrualDto> CreateRecognizedAsync(
        InMemoryAccrualRepository accruals,
        InMemoryFinanceWorkspaceRepository workspaces,
        FixedClock clock,
        Guid workspaceId)
    {
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, created.Id));
        Assert.True(recognized.IsSuccess);
        return recognized.Value!;
    }

    [Fact]
    public async Task Create_returns_draft_dto_and_persists_once()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateAccrualHandler(accruals, workspaces, clock).HandleAsync(
            new CreateAccrualCommand(
                workspaceId,
                "Revenue",
                250.50m,
                "eur",
                RecognitionDate,
                "  Q1 revenue  ",
                SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.NotEqual(Guid.Empty, result.Value!.Id);
        Assert.Equal(workspaceId, result.Value.FinanceWorkspaceId);
        Assert.Equal(nameof(AccrualType.Revenue), result.Value.Type);
        Assert.Equal(250.50m, result.Value.Amount);
        Assert.Equal("EUR", result.Value.Currency);
        Assert.Equal(RecognitionDate, result.Value.RecognitionDateUtc);
        Assert.Equal("Q1 revenue", result.Value.Description);
        Assert.Equal(SourceInvoiceId, result.Value.SourceInvoiceId);
        Assert.Equal(nameof(AccrualStatus.Draft), result.Value.Status);
        Assert.Equal(T0, result.Value.CreatedAtUtc);
        Assert.Equal(T0, result.Value.UpdatedAtUtc);
        Assert.Null(result.Value.RecognizedAtUtc);
        Assert.Null(result.Value.ReversedAtUtc);
        Assert.Null(result.Value.ReversalReason);
        Assert.Equal(1, accruals.AddCallCount);
        Assert.Equal(1, accruals.SaveChangesCallCount);
        Assert.NotNull(accruals.FindById(result.Value.Id));
    }

    [Fact]
    public async Task Create_rejects_missing_workspace_without_persist()
    {
        var (accruals, workspaces, clock) = CreateHarness();

        var result = await new CreateAccrualHandler(accruals, workspaces, clock).HandleAsync(
            new CreateAccrualCommand(
                Guid.NewGuid(),
                "Expense",
                10m,
                "UAH",
                RecognitionDate,
                "Rent",
                null));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(0, accruals.AddCallCount);
        Assert.Equal(0, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_rejects_invalid_amount_without_persist()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateAccrualHandler(accruals, workspaces, clock).HandleAsync(
            new CreateAccrualCommand(
                workspaceId,
                "Revenue",
                0m,
                "UAH",
                RecognitionDate,
                "Bad",
                null));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.AddCallCount);
        Assert.Equal(0, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_rejects_blank_description_without_persist()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new CreateAccrualHandler(accruals, workspaces, clock).HandleAsync(
            new CreateAccrualCommand(
                workspaceId,
                "Revenue",
                10m,
                "UAH",
                RecognitionDate,
                "   ",
                null));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.AddCallCount);
        Assert.Equal(0, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Create_expense_type_is_supported()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var created = await CreateAccrualAsync(
            accruals,
            workspaces,
            clock,
            workspaceId,
            type: "Expense",
            description: "Office rent");

        Assert.Equal(nameof(AccrualType.Expense), created.Type);
    }

    [Fact]
    public async Task Get_returns_accrual_from_same_workspace()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new GetAccrualHandler(accruals).HandleAsync(
            new GetAccrualByIdQuery(workspaceId, created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(created.Id, result.Value!.Id);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Get_missing_returns_NotFound()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualHandler(accruals).HandleAsync(
            new GetAccrualByIdQuery(workspaceId, Guid.NewGuid()));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Accrual was not found.", result.ErrorMessage);
    }

    [Fact]
    public async Task Get_wrong_workspace_returns_NotFound()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceA);

        var result = await new GetAccrualHandler(accruals).HandleAsync(
            new GetAccrualByIdQuery(workspaceB, created.Id));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal("Accrual was not found.", result.ErrorMessage);
    }

    [Fact]
    public async Task List_empty_workspace_returns_empty_list()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsHandler(accruals).HandleAsync(
            new GetAccrualsQuery(workspaceId));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!);
        Assert.Equal(1, accruals.ListByWorkspaceCallCount);
        Assert.Equal(workspaceId, accruals.LastListedWorkspaceId!.Value.Value);
    }

    [Fact]
    public async Task List_returns_only_requested_workspace_newest_first()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        clock.UtcNow = T0;
        var older = await CreateAccrualAsync(accruals, workspaces, clock, workspaceA, description: "Older");
        clock.UtcNow = T1;
        var newer = await CreateAccrualAsync(accruals, workspaces, clock, workspaceA, description: "Newer");
        clock.UtcNow = T2;
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceB, description: "Other workspace");

        var result = await new GetAccrualsHandler(accruals).HandleAsync(
            new GetAccrualsQuery(workspaceA));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(newer.Id, result.Value[0].Id);
        Assert.Equal(older.Id, result.Value[1].Id);
        Assert.Equal(workspaceA, accruals.LastListedWorkspaceId!.Value.Value);
    }

    [Fact]
    public async Task ListPaged_returns_page_with_total_count()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        clock.UtcNow = T0;
        var older = await CreateAccrualAsync(accruals, workspaces, clock, workspaceA, description: "Older");
        clock.UtcNow = T1;
        var newer = await CreateAccrualAsync(accruals, workspaces, clock, workspaceA, description: "Newer");
        clock.UtcNow = T2;
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceB, description: "Other");

        using var cts = new CancellationTokenSource();
        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceA, Page: 1, PageSize: 10),
            cts.Token);

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.Page);
        Assert.Equal(10, result.Value.PageSize);
        Assert.Equal(2, result.Value.TotalCount);
        Assert.Equal(2, result.Value.Items.Count);
        Assert.Equal(newer.Id, result.Value.Items[0].Id);
        Assert.Equal(older.Id, result.Value.Items[1].Id);
        Assert.Equal(1, accruals.ListPagedCallCount);
        Assert.Equal(workspaceA, accruals.LastListedWorkspaceId!.Value.Value);
        Assert.Equal(1, accruals.LastListedPage);
        Assert.Equal(10, accruals.LastListedPageSize);
        Assert.Equal(cts.Token, accruals.LastListPagedCancellationToken);
    }

    [Fact]
    public async Task ListPaged_empty_returns_empty_items_with_zero_total()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 20));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Equal(0, result.Value.TotalCount);
        Assert.Equal(1, result.Value.Page);
        Assert.Equal(20, result.Value.PageSize);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_multiple_pages_preserve_order_and_total()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var first = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "1");
        clock.UtcNow = T1;
        var second = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "2");
        clock.UtcNow = T2;
        var third = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "3");

        var page1 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 2));
        var page2 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 2, PageSize: 2));

        Assert.True(page1.IsSuccess);
        Assert.True(page2.IsSuccess);
        Assert.Equal(3, page1.Value!.TotalCount);
        Assert.Equal(3, page2.Value!.TotalCount);
        Assert.Equal(new[] { third.Id, second.Id }, page1.Value.Items.Select(item => item.Id).ToArray());
        Assert.Equal(new[] { first.Id }, page2.Value.Items.Select(item => item.Id).ToArray());
    }

    [Fact]
    public async Task ListPaged_rejects_page_below_one()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 0, PageSize: 10));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_negative_page()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: -1, PageSize: 10));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_page_size_below_one()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_negative_page_size()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: -5));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_rejects_page_size_above_max()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: GetAccrualsPagedHandler.MaxPageSize + 1));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_accepts_exact_max_page_size()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: GetAccrualsPagedHandler.MaxPageSize));

        Assert.True(result.IsSuccess);
        Assert.Equal(GetAccrualsPagedHandler.MaxPageSize, result.Value!.PageSize);
        Assert.Equal(GetAccrualsPagedHandler.MaxPageSize, accruals.LastListedPageSize);
    }

    [Fact]
    public async Task ListPaged_rejects_empty_workspace_id()
    {
        var (accruals, _, _) = CreateHarness();

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(Guid.Empty, Page: 1, PageSize: 10));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_missing_status_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedStatus);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_status_Draft_passes_Draft_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Draft"));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(nameof(AccrualStatus.Draft), Assert.Single(result.Value.Items).Status);
    }

    [Fact]
    public async Task ListPaged_status_Recognized_passes_Recognized_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Recognized"));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Recognized, accruals.LastListedStatus);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(nameof(AccrualStatus.Recognized), Assert.Single(result.Value.Items).Status);
    }

    [Fact]
    public async Task ListPaged_status_Reversed_passes_Reversed_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var recognized = await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        var reversed = await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, recognized.Id, "Correction"));
        Assert.True(reversed.IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Reversed"));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Reversed, accruals.LastListedStatus);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(nameof(AccrualStatus.Reversed), Assert.Single(result.Value.Items).Status);
    }

    [Fact]
    public async Task ListPaged_explicit_blank_status_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: ""));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_whitespace_status_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_unknown_status_Paid_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Paid"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_lowercase_status_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "draft"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_numeric_status_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "1"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_padded_status_returns_ValidationFailed_without_repository_call()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: " Draft "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_status_filter_empty_match_returns_empty_page()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft only");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Status: "Recognized"));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Equal(0, result.Value.TotalCount);
        Assert.Equal(AccrualStatus.Recognized, accruals.LastListedStatus);
    }

    [Fact]
    public async Task ListPaged_status_filter_pages_within_filtered_set()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var draftOlder = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft older");
        clock.UtcNow = T1;
        var draftNewer = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft newer");
        clock.UtcNow = T2;
        var toRecognize = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Recognized");
        clock.UtcNow = T2.AddMinutes(1);
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, toRecognize.Id));
        Assert.True(recognized.IsSuccess);

        var page1 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 1, Status: "Draft"));
        var page2 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 2, PageSize: 1, Status: "Draft"));

        Assert.True(page1.IsSuccess);
        Assert.True(page2.IsSuccess);
        Assert.Equal(2, page1.Value!.TotalCount);
        Assert.Equal(2, page2.Value!.TotalCount);
        Assert.Equal(draftNewer.Id, Assert.Single(page1.Value.Items).Id);
        Assert.Equal(draftOlder.Id, Assert.Single(page2.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_omitted_created_bounds_pass_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "1");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedCreatedFromUtc);
        Assert.Null(accruals.LastListedCreatedToUtc);
        Assert.Null(accruals.LastListedStatus);
        Assert.Null(accruals.LastListedPagedSourceInvoiceId);
    }

    [Fact]
    public async Task ListPaged_created_from_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var from = T1;

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, CreatedFromUtc: from));

        Assert.True(result.IsSuccess);
        Assert.Equal(from, accruals.LastListedCreatedFromUtc);
        Assert.Null(accruals.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_created_to_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var to = T1;

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, CreatedToUtc: to));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedCreatedFromUtc);
        Assert.Equal(to, accruals.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_created_both_bounds_pass_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                CreatedFromUtc: T0,
                CreatedToUtc: T2));

        Assert.True(result.IsSuccess);
        Assert.Equal(T0, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T2, accruals.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_equal_created_bounds_are_accepted()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                CreatedFromUtc: T1,
                CreatedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T1, accruals.LastListedCreatedToUtc);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_created_from_after_to_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                CreatedFromUtc: T2,
                CreatedToUtc: T0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_created_range_with_status_forwards_both()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
        Assert.Equal(T0, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T2, accruals.LastListedCreatedToUtc);
    }

    [Fact]
    public async Task ListPaged_created_from_filters_inclusive_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Earlier");
        clock.UtcNow = T1;
        var onBound = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "On bound");
        clock.UtcNow = T2;
        var later = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Later");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, CreatedFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(later.Id, result.Value.Items[0].Id);
        Assert.Equal(onBound.Id, result.Value.Items[1].Id);
    }

    [Fact]
    public async Task ListPaged_created_range_pages_after_filter()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "1");
        clock.UtcNow = T1;
        var mid = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "2");
        clock.UtcNow = T2;
        var newest = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "3");

        var page1 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 1,
                CreatedFromUtc: T0,
                CreatedToUtc: T2));
        var page2 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 2,
                PageSize: 1,
                CreatedFromUtc: T0,
                CreatedToUtc: T2));

        Assert.True(page1.IsSuccess);
        Assert.True(page2.IsSuccess);
        Assert.Equal(3, page1.Value!.TotalCount);
        Assert.Equal(3, page2.Value!.TotalCount);
        Assert.Equal(newest.Id, Assert.Single(page1.Value.Items).Id);
        Assert.Equal(mid.Id, Assert.Single(page2.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_omitted_source_invoice_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "1");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedPagedSourceInvoiceId);
    }

    [Fact]
    public async Task ListPaged_source_invoice_passes_id_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                SourceInvoiceId: SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(SourceInvoiceId, accruals.LastListedPagedSourceInvoiceId!.Value.Value);
    }

    [Fact]
    public async Task ListPaged_empty_source_invoice_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                SourceInvoiceId: Guid.Empty));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_source_invoice_filters_matching_accruals()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other", sourceInvoiceId: otherInvoiceId);
        clock.UtcNow = T1;
        var olderMatch = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Match older", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T2;
        var newerMatch = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Match newer", sourceInvoiceId: SourceInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Unlinked", sourceInvoiceId: null);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                SourceInvoiceId: SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(newerMatch.Id, result.Value.Items[0].Id);
        Assert.Equal(olderMatch.Id, result.Value.Items[1].Id);
        Assert.All(result.Value.Items, dto => Assert.Equal(SourceInvoiceId, dto.SourceInvoiceId));
    }

    [Fact]
    public async Task ListPaged_source_invoice_no_match_returns_empty_page()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other", sourceInvoiceId: SourceInvoiceId);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                SourceInvoiceId: Guid.Parse("33333333-3333-3333-3333-333333333333")));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Equal(0, result.Value.TotalCount);
    }

    [Fact]
    public async Task ListPaged_source_invoice_with_status_and_created_range_forwards_all()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
        Assert.Equal(T0, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T2, accruals.LastListedCreatedToUtc);
        Assert.Equal(SourceInvoiceId, accruals.LastListedPagedSourceInvoiceId!.Value.Value);
    }

    [Fact]
    public async Task ListPaged_source_invoice_composes_with_status_and_created_range()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Draft other invoice", sourceInvoiceId: otherInvoiceId);
        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Draft match", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T2;
        var recognizedMatch = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Recognized match", sourceInvoiceId: SourceInvoiceId);
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, recognizedMatch.Id));
        Assert.True(recognized.IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.NotEqual(recognizedMatch.Id, result.Value.Items[0].Id);
    }

    [Fact]
    public async Task ListPaged_source_invoice_pages_after_filter()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "1", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T1;
        var mid = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "2", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T2;
        var newest = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "3", sourceInvoiceId: SourceInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other", sourceInvoiceId: null);

        var page1 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 1,
                SourceInvoiceId: SourceInvoiceId));
        var page2 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 2,
                PageSize: 1,
                SourceInvoiceId: SourceInvoiceId));

        Assert.True(page1.IsSuccess);
        Assert.True(page2.IsSuccess);
        Assert.Equal(3, page1.Value!.TotalCount);
        Assert.Equal(3, page2.Value!.TotalCount);
        Assert.Equal(newest.Id, Assert.Single(page1.Value.Items).Id);
        Assert.Equal(mid.Id, Assert.Single(page2.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_omitted_type_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "1");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedType);
    }

    [Fact]
    public async Task ListPaged_type_Revenue_passes_enum_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "Revenue"));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualType.Revenue, accruals.LastListedType);
    }

    [Fact]
    public async Task ListPaged_type_Expense_passes_enum_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "Expense"));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualType.Expense, accruals.LastListedType);
    }

    [Fact]
    public async Task ListPaged_type_Revenue_filters_matching_accruals()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, type: "Expense", description: "Expense");
        clock.UtcNow = T1;
        var olderRevenue = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, type: "Revenue", description: "Older revenue");
        clock.UtcNow = T2;
        var newerRevenue = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, type: "Revenue", description: "Newer revenue");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "Revenue"));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(newerRevenue.Id, result.Value.Items[0].Id);
        Assert.Equal(olderRevenue.Id, result.Value.Items[1].Id);
        Assert.All(result.Value.Items, dto => Assert.Equal(nameof(AccrualType.Revenue), dto.Type));
    }

    [Fact]
    public async Task ListPaged_type_Expense_filters_matching_accruals()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, type: "Revenue", description: "Revenue");
        var expense = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, type: "Expense", description: "Expense");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "Expense"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(expense.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal(nameof(AccrualType.Expense), result.Value.Items[0].Type);
    }

    [Fact]
    public async Task ListPaged_blank_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: ""));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_whitespace_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_lowercase_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "revenue"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_uppercase_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "REVENUE"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_unknown_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "Asset"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_numeric_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: "1"));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_trimmed_type_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Type: " Revenue "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_type_preserves_status_created_range_source_invoice_and_paging()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        using var cts = new CancellationTokenSource();
        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 2,
                PageSize: 5,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId,
                Type: "Revenue"),
            cts.Token);

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
        Assert.Equal(T0, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T2, accruals.LastListedCreatedToUtc);
        Assert.Equal(SourceInvoiceId, accruals.LastListedPagedSourceInvoiceId!.Value.Value);
        Assert.Equal(AccrualType.Revenue, accruals.LastListedType);
        Assert.Equal(2, accruals.LastListedPage);
        Assert.Equal(5, accruals.LastListedPageSize);
        Assert.Equal(cts.Token, accruals.LastListPagedCancellationToken);
    }

    [Fact]
    public async Task ListPaged_type_composes_with_status_source_invoice_and_created_range()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue", description: "Out of range", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue", description: "Match", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Expense", description: "Wrong type", sourceInvoiceId: SourceInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue", description: "Wrong invoice", sourceInvoiceId: otherInvoiceId);
        var toRecognize = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue", description: "Wrong status", sourceInvoiceId: SourceInvoiceId);
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, toRecognize.Id));
        Assert.True(recognized.IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                CreatedFromUtc: T1,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId,
                Type: "Revenue"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_omitted_recognition_bounds_pass_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "1");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedRecognitionFromUtc);
        Assert.Null(accruals.LastListedRecognitionToUtc);
    }

    [Fact]
    public async Task ListPaged_recognition_from_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognitionFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedRecognitionFromUtc);
        Assert.Null(accruals.LastListedRecognitionToUtc);
    }

    [Fact]
    public async Task ListPaged_recognition_to_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognitionToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedRecognitionFromUtc);
        Assert.Equal(T1, accruals.LastListedRecognitionToUtc);
    }

    [Fact]
    public async Task ListPaged_recognition_both_bounds_pass_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognitionFromUtc: T0,
                RecognitionToUtc: T2));

        Assert.True(result.IsSuccess);
        Assert.Equal(T0, accruals.LastListedRecognitionFromUtc);
        Assert.Equal(T2, accruals.LastListedRecognitionToUtc);
    }

    [Fact]
    public async Task ListPaged_equal_recognition_bounds_are_accepted()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognitionFromUtc: T1,
                RecognitionToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedRecognitionFromUtc);
        Assert.Equal(T1, accruals.LastListedRecognitionToUtc);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_recognition_from_after_to_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognitionFromUtc: T2,
                RecognitionToUtc: T0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_recognition_from_filters_inclusive_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            recognitionDate: T0, description: "Earlier");
        var onBound = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            recognitionDate: T1, description: "On bound");
        var later = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            recognitionDate: T2, description: "Later");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognitionFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Contains(result.Value.Items, item => item.Id == onBound.Id);
        Assert.Contains(result.Value.Items, item => item.Id == later.Id);
    }

    [Fact]
    public async Task ListPaged_recognition_preserves_status_created_source_type_and_paging()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        using var cts = new CancellationTokenSource();
        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 2,
                PageSize: 5,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId,
                Type: "Revenue",
                RecognitionFromUtc: RecognitionDate,
                RecognitionToUtc: RecognitionDateAlt),
            cts.Token);

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
        Assert.Equal(T0, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T2, accruals.LastListedCreatedToUtc);
        Assert.Equal(SourceInvoiceId, accruals.LastListedPagedSourceInvoiceId!.Value.Value);
        Assert.Equal(AccrualType.Revenue, accruals.LastListedType);
        Assert.Equal(RecognitionDate, accruals.LastListedRecognitionFromUtc);
        Assert.Equal(RecognitionDateAlt, accruals.LastListedRecognitionToUtc);
        Assert.Equal(2, accruals.LastListedPage);
        Assert.Equal(5, accruals.LastListedPageSize);
        Assert.Equal(cts.Token, accruals.LastListPagedCancellationToken);
    }

    [Fact]
    public async Task ListPaged_recognition_composes_with_status_created_source_and_type()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue",
            recognitionDate: T0,
            description: "Recognition out of range",
            sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue",
            recognitionDate: T1,
            description: "Match",
            sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Expense",
            recognitionDate: T1,
            description: "Wrong type",
            sourceInvoiceId: SourceInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue",
            recognitionDate: T1,
            description: "Wrong invoice",
            sourceInvoiceId: otherInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue",
            recognitionDate: T2,
            description: "Recognition after",
            sourceInvoiceId: SourceInvoiceId);
        var toRecognize = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            type: "Revenue",
            recognitionDate: T1,
            description: "Wrong status",
            sourceInvoiceId: SourceInvoiceId);
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, toRecognize.Id));
        Assert.True(recognized.IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                CreatedFromUtc: T1,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId,
                Type: "Revenue",
                RecognitionFromUtc: T1,
                RecognitionToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_recognition_range_pages_after_filter()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            recognitionDate: T0, description: "1");
        clock.UtcNow = T1;
        var mid = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            recognitionDate: T1, description: "2");
        clock.UtcNow = T2;
        var newest = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            recognitionDate: T1, description: "3");

        var page1 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 1,
                RecognitionFromUtc: T1,
                RecognitionToUtc: T1));
        var page2 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 2,
                PageSize: 1,
                RecognitionFromUtc: T1,
                RecognitionToUtc: T1));

        Assert.True(page1.IsSuccess);
        Assert.True(page2.IsSuccess);
        Assert.Equal(2, page1.Value!.TotalCount);
        Assert.Equal(2, page2.Value!.TotalCount);
        Assert.Equal(newest.Id, Assert.Single(page1.Value.Items).Id);
        Assert.Equal(mid.Id, Assert.Single(page2.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_omitted_currency_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, currency: "UAH");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedPagedCurrency);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_currency_passes_normalized_code_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: "usd"));

        Assert.True(result.IsSuccess);
        Assert.Equal("USD", accruals.LastListedPagedCurrency);
    }

    [Fact]
    public async Task ListPaged_currency_trims_and_uppercases_before_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: "  usd  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("USD", accruals.LastListedPagedCurrency);
    }

    [Fact]
    public async Task ListPaged_blank_currency_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: ""));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_whitespace_currency_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_currency_filters_matching_accruals()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, currency: "EUR", description: "Other");
        clock.UtcNow = T1;
        var olderMatch = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, currency: "USD", description: "Older");
        clock.UtcNow = T2;
        var newerMatch = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, currency: "USD", description: "Newer");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: "USD"));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(newerMatch.Id, result.Value.Items[0].Id);
        Assert.Equal(olderMatch.Id, result.Value.Items[1].Id);
        Assert.All(result.Value.Items, dto => Assert.Equal("USD", dto.Currency));
    }

    [Fact]
    public async Task ListPaged_currency_no_match_returns_empty_page()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, currency: "UAH");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: "USD"));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Items);
        Assert.Equal(0, result.Value.TotalCount);
    }

    [Fact]
    public async Task ListPaged_currency_with_status_created_source_type_and_recognition_forwards_all()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 2,
                PageSize: 5,
                Status: "Draft",
                CreatedFromUtc: T0,
                CreatedToUtc: T2,
                SourceInvoiceId: SourceInvoiceId,
                Type: "Revenue",
                RecognitionFromUtc: RecognitionDate,
                RecognitionToUtc: RecognitionDateAlt,
                Currency: "usd"));

        Assert.True(result.IsSuccess);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
        Assert.Equal(T0, accruals.LastListedCreatedFromUtc);
        Assert.Equal(T2, accruals.LastListedCreatedToUtc);
        Assert.Equal(SourceInvoiceId, accruals.LastListedPagedSourceInvoiceId!.Value.Value);
        Assert.Equal(AccrualType.Revenue, accruals.LastListedType);
        Assert.Equal(RecognitionDate, accruals.LastListedRecognitionFromUtc);
        Assert.Equal(RecognitionDateAlt, accruals.LastListedRecognitionToUtc);
        Assert.Equal("USD", accruals.LastListedPagedCurrency);
        Assert.Equal(2, accruals.LastListedPage);
        Assert.Equal(5, accruals.LastListedPageSize);
    }

    [Fact]
    public async Task ListPaged_currency_composes_with_status()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var draftMatch = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, currency: "USD", description: "Draft match");
        clock.UtcNow = T1;
        var toRecognize = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, currency: "USD", description: "Recognized");
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, toRecognize.Id));
        Assert.True(recognized.IsSuccess);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, currency: "EUR", description: "Wrong currency");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                Currency: "USD"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(draftMatch.Id, Assert.Single(result.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_omitted_amount_bounds_pass_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, amount: 100m);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedAmountFrom);
        Assert.Null(accruals.LastListedAmountTo);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_amount_from_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, AmountFrom: 50m));

        Assert.True(result.IsSuccess);
        Assert.Equal(50m, accruals.LastListedAmountFrom);
        Assert.Null(accruals.LastListedAmountTo);
    }

    [Fact]
    public async Task ListPaged_amount_to_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, AmountTo: 50m));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedAmountFrom);
        Assert.Equal(50m, accruals.LastListedAmountTo);
    }

    [Fact]
    public async Task ListPaged_amount_both_bounds_pass_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                AmountFrom: 10m,
                AmountTo: 100m));

        Assert.True(result.IsSuccess);
        Assert.Equal(10m, accruals.LastListedAmountFrom);
        Assert.Equal(100m, accruals.LastListedAmountTo);
    }

    [Fact]
    public async Task ListPaged_equal_amount_bounds_are_accepted()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                AmountFrom: 25m,
                AmountTo: 25m));

        Assert.True(result.IsSuccess);
        Assert.Equal(25m, accruals.LastListedAmountFrom);
        Assert.Equal(25m, accruals.LastListedAmountTo);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_amount_from_greater_than_to_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                AmountFrom: 100m,
                AmountTo: 10m));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_amount_from_filters_inclusive_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, amount: 10m, description: "Below");
        clock.UtcNow = T1;
        var onBound = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, amount: 50m, description: "On bound");
        clock.UtcNow = T2;
        var above = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, amount: 100m, description: "Above");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, AmountFrom: 50m));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(above.Id, result.Value.Items[0].Id);
        Assert.Equal(onBound.Id, result.Value.Items[1].Id);
    }

    [Fact]
    public async Task ListPaged_amount_composes_with_currency()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "USD", description: "Match");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "EUR", description: "Wrong currency");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 10m, currency: "USD", description: "Wrong amount");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Currency: "USD",
                AmountFrom: 40m,
                AmountTo: 60m));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal(40m, accruals.LastListedAmountFrom);
        Assert.Equal(60m, accruals.LastListedAmountTo);
        Assert.Equal("USD", accruals.LastListedPagedCurrency);
    }

    [Fact]
    public async Task ListPaged_omitted_description_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Alpha");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedPagedDescription);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_description_passes_normalized_value_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Description: "  Exact match  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("Exact match", accruals.LastListedPagedDescription);
    }

    [Fact]
    public async Task ListPaged_blank_description_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Description: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_overlength_description_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var overlength = new string('x', Accrual.DescriptionMaxLength + 1);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, Description: overlength));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_description_filters_exact_ordinal_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other");
        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Exact match");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "exact match");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Description: "Exact match"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Exact match", accruals.LastListedPagedDescription);
    }

    [Fact]
    public async Task ListPaged_description_composes_with_currency_and_status()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "USD", description: "Target");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "EUR", description: "Target");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "USD", description: "Other");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                Currency: "USD",
                Description: "Target"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("USD", accruals.LastListedPagedCurrency);
        Assert.Equal("Target", accruals.LastListedPagedDescription);
        Assert.Equal(AccrualStatus.Draft, accruals.LastListedStatus);
    }

    [Fact]
    public async Task ListPaged_omitted_description_prefix_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Alpha");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedPagedDescriptionPrefix);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_description_prefix_passes_normalized_value_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                DescriptionPrefix: "  Al  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("Al", accruals.LastListedPagedDescriptionPrefix);
    }

    [Fact]
    public async Task ListPaged_blank_description_prefix_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, DescriptionPrefix: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_overlength_description_prefix_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var overlength = new string('x', Accrual.DescriptionMaxLength + 1);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, DescriptionPrefix: overlength));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_description_prefix_filters_ordinal_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "alpha");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                DescriptionPrefix: "Al"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Al", accruals.LastListedPagedDescriptionPrefix);
    }

    [Fact]
    public async Task ListPaged_description_prefix_lowercase_matches_lowercase_only()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha");
        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "alpha");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                DescriptionPrefix: "al"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_description_exact_unchanged_when_prefix_omitted()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Exact match");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "exact match");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Description: "Exact match"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Null(accruals.LastListedPagedDescriptionPrefix);
        Assert.Equal("Exact match", accruals.LastListedPagedDescription);
    }

    [Fact]
    public async Task ListPaged_description_exact_and_prefix_compose_under_and()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alphabet");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Description: "Alpha",
                DescriptionPrefix: "Al"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Alpha", accruals.LastListedPagedDescription);
        Assert.Equal("Al", accruals.LastListedPagedDescriptionPrefix);
    }

    [Fact]
    public async Task ListPaged_description_prefix_composes_with_reversal_reason()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, match.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, match.Id, "Target"))).IsSuccess);

        clock.UtcNow = T1;
        var wrongReason = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpine");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, wrongReason.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, wrongReason.Id, "Other"))).IsSuccess);

        clock.UtcNow = T2;
        var wrongPrefix = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Beta");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, wrongPrefix.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, wrongPrefix.Id, "Target"))).IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                DescriptionPrefix: "Al",
                ReversalReason: "Target"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Al", accruals.LastListedPagedDescriptionPrefix);
        Assert.Equal("Target", accruals.LastListedPagedReversalReason);
    }

    [Fact]
    public async Task ListPaged_description_prefix_composes_with_currency_and_status()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "USD", description: "Alpha");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "EUR", description: "Alpha");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            amount: 50m, currency: "USD", description: "Beta");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Status: "Draft",
                Currency: "USD",
                DescriptionPrefix: "Al"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Al", accruals.LastListedPagedDescriptionPrefix);
    }

    [Fact]
    public async Task ListPaged_description_prefix_wildcard_characters_are_literal()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Al%ha");
        clock.UtcNow = T1;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha");
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Al_ha");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                DescriptionPrefix: "Al%"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
    }

    [Fact]
    public async Task ListPaged_description_prefix_pages_after_filter()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var first = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha1");
        clock.UtcNow = T1;
        var second = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha2");
        clock.UtcNow = T2;
        var third = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Alpha3");
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Beta");

        var page1 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId, Page: 1, PageSize: 1, DescriptionPrefix: "Alpha"));
        var page2 = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId, Page: 2, PageSize: 1, DescriptionPrefix: "Alpha"));

        Assert.True(page1.IsSuccess);
        Assert.True(page2.IsSuccess);
        Assert.Equal(3, page1.Value!.TotalCount);
        Assert.Equal(3, page2.Value!.TotalCount);
        Assert.Equal(third.Id, Assert.Single(page1.Value.Items).Id);
        Assert.Equal(second.Id, Assert.Single(page2.Value.Items).Id);
        Assert.Equal(first.Id, (await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId, Page: 3, PageSize: 1, DescriptionPrefix: "Alpha")))
            .Value!.Items[0].Id);
    }

    [Fact]
    public async Task ListPaged_omitted_recognized_bounds_pass_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedRecognizedFromUtc);
        Assert.Null(accruals.LastListedRecognizedToUtc);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_recognized_from_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognizedFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedRecognizedFromUtc);
        Assert.Null(accruals.LastListedRecognizedToUtc);
    }

    [Fact]
    public async Task ListPaged_recognized_to_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognizedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedRecognizedFromUtc);
        Assert.Equal(T1, accruals.LastListedRecognizedToUtc);
    }

    [Fact]
    public async Task ListPaged_recognized_both_bounds_pass_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognizedFromUtc: T0,
                RecognizedToUtc: T2));

        Assert.True(result.IsSuccess);
        Assert.Equal(T0, accruals.LastListedRecognizedFromUtc);
        Assert.Equal(T2, accruals.LastListedRecognizedToUtc);
    }

    [Fact]
    public async Task ListPaged_equal_recognized_bounds_are_accepted()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognizedFromUtc: T1,
                RecognizedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedRecognizedFromUtc);
        Assert.Equal(T1, accruals.LastListedRecognizedToUtc);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_recognized_from_after_to_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognizedFromUtc: T2,
                RecognizedToUtc: T0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_recognized_from_filters_inclusive_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var early = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Early");
        var earlyRecognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, early.Id));
        Assert.True(earlyRecognized.IsSuccess);

        clock.UtcNow = T1;
        var onBound = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "On");
        var onBoundRecognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, onBound.Id));
        Assert.True(onBoundRecognized.IsSuccess);

        clock.UtcNow = T2;
        var late = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Late");
        var lateRecognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, late.Id));
        Assert.True(lateRecognized.IsSuccess);

        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognizedFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(late.Id, result.Value.Items[0].Id);
        Assert.Equal(onBound.Id, result.Value.Items[1].Id);
        Assert.Equal(T1, accruals.LastListedRecognizedFromUtc);
    }

    [Fact]
    public async Task ListPaged_recognized_bound_excludes_null_recognized_at()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T1;
        var draft = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");
        var toRecognize = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Recognized");
        var recognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, toRecognize.Id));
        Assert.True(recognized.IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, RecognizedFromUtc: T0));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(toRecognize.Id, Assert.Single(result.Value.Items).Id);
        Assert.DoesNotContain(result.Value.Items, item => item.Id == draft.Id);
    }

    [Fact]
    public async Task ListPaged_recognized_composes_with_description_and_is_independent_of_recognition_date()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            description: "Target",
            recognitionDate: RecognitionDate);
        var matchRecognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, match.Id));
        Assert.True(matchRecognized.IsSuccess);

        clock.UtcNow = T1;
        var wrongDescription = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            description: "Other",
            recognitionDate: RecognitionDate);
        var wrongDescriptionRecognized = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, wrongDescription.Id));
        Assert.True(wrongDescriptionRecognized.IsSuccess);

        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId,
            description: "Target",
            recognitionDate: RecognitionDateAlt);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                RecognitionFromUtc: RecognitionDate,
                RecognitionToUtc: RecognitionDate,
                Description: "Target",
                RecognizedFromUtc: T0,
                RecognizedToUtc: T0));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal(RecognitionDate, accruals.LastListedRecognitionFromUtc);
        Assert.Equal(RecognitionDate, accruals.LastListedRecognitionToUtc);
        Assert.Equal("Target", accruals.LastListedPagedDescription);
        Assert.Equal(T0, accruals.LastListedRecognizedFromUtc);
        Assert.Equal(T0, accruals.LastListedRecognizedToUtc);
    }

    [Fact]
    public async Task ListPaged_omitted_reversed_bounds_pass_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedReversedFromUtc);
        Assert.Null(accruals.LastListedReversedToUtc);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_reversed_from_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, ReversedFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedReversedFromUtc);
        Assert.Null(accruals.LastListedReversedToUtc);
    }

    [Fact]
    public async Task ListPaged_reversed_to_only_passes_bound_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, ReversedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedReversedFromUtc);
        Assert.Equal(T1, accruals.LastListedReversedToUtc);
    }

    [Fact]
    public async Task ListPaged_equal_reversed_bounds_are_accepted()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                ReversedFromUtc: T1,
                ReversedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(T1, accruals.LastListedReversedFromUtc);
        Assert.Equal(T1, accruals.LastListedReversedToUtc);
        Assert.Equal(1, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_reversed_from_after_to_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                ReversedFromUtc: T2,
                ReversedToUtc: T0));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_reversed_from_filters_inclusive_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var early = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Early");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, early.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, early.Id, "Early reverse"))).IsSuccess);

        clock.UtcNow = T1;
        var onBound = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "On");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, onBound.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, onBound.Id, "On reverse"))).IsSuccess);

        clock.UtcNow = T2;
        var late = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Late");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, late.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, late.Id, "Late reverse"))).IsSuccess);

        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, ReversedFromUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.TotalCount);
        Assert.Equal(late.Id, result.Value.Items[0].Id);
        Assert.Equal(onBound.Id, result.Value.Items[1].Id);
        Assert.Equal(T1, accruals.LastListedReversedFromUtc);
    }

    [Fact]
    public async Task ListPaged_reversed_bound_excludes_null_reversed_at()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var draft = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");
        var recognizedOnly = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Recognized");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, recognizedOnly.Id))).IsSuccess);

        clock.UtcNow = T1;
        var reversed = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Reversed");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, reversed.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, reversed.Id, "Undo"))).IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, ReversedFromUtc: T0));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(reversed.Id, Assert.Single(result.Value.Items).Id);
        Assert.DoesNotContain(result.Value.Items, item => item.Id == draft.Id);
        Assert.DoesNotContain(result.Value.Items, item => item.Id == recognizedOnly.Id);
    }

    [Fact]
    public async Task ListPaged_reversed_composes_with_recognized_and_description()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var match = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Target");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, match.Id))).IsSuccess);
        clock.UtcNow = T1;
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, match.Id, "Undo"))).IsSuccess);

        clock.UtcNow = T0;
        var wrongDescription = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, wrongDescription.Id))).IsSuccess);
        clock.UtcNow = T1;
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, wrongDescription.Id, "Undo"))).IsSuccess);

        clock.UtcNow = T0;
        var recognizedOnly = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Target");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, recognizedOnly.Id))).IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                Description: "Target",
                RecognizedFromUtc: T0,
                RecognizedToUtc: T0,
                ReversedFromUtc: T1,
                ReversedToUtc: T1));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Target", accruals.LastListedPagedDescription);
        Assert.Equal(T0, accruals.LastListedRecognizedFromUtc);
        Assert.Equal(T1, accruals.LastListedReversedFromUtc);
        Assert.Equal(T1, accruals.LastListedReversedToUtc);
    }

    [Fact]
    public async Task ListPaged_omitted_reversal_reason_passes_null_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10));

        Assert.True(result.IsSuccess);
        Assert.Null(accruals.LastListedPagedReversalReason);
        Assert.Equal(1, result.Value!.TotalCount);
    }

    [Fact]
    public async Task ListPaged_reversal_reason_passes_normalized_value_to_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                ReversalReason: "  Exact reason  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("Exact reason", accruals.LastListedPagedReversalReason);
    }

    [Fact]
    public async Task ListPaged_blank_reversal_reason_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, ReversalReason: "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_overlength_reversal_reason_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var overlength = new string('x', Accrual.ReversalReasonMaxLength + 1);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(workspaceId, Page: 1, PageSize: 10, ReversalReason: overlength));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListPagedCallCount);
    }

    [Fact]
    public async Task ListPaged_reversal_reason_filters_exact_ordinal_via_repository()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T0;
        var other = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "A");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, other.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, other.Id, "Other reason"))).IsSuccess);

        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "B");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, match.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, match.Id, "Exact reason"))).IsSuccess);

        clock.UtcNow = T2;
        var caseVariant = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "C");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, caseVariant.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, caseVariant.Id, "exact reason"))).IsSuccess);

        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Draft");

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                ReversalReason: "Exact reason"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Exact reason", accruals.LastListedPagedReversalReason);
    }

    [Fact]
    public async Task ListPaged_reversal_reason_composes_with_reversed_range()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        clock.UtcNow = T1;
        var match = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Match");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, match.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, match.Id, "Target"))).IsSuccess);

        clock.UtcNow = T0;
        var wrongReason = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Wrong");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, wrongReason.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, wrongReason.Id, "Other"))).IsSuccess);

        clock.UtcNow = T2;
        var outOfRange = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Late");
        Assert.True((await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, outOfRange.Id))).IsSuccess);
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, outOfRange.Id, "Target"))).IsSuccess);

        var result = await new GetAccrualsPagedHandler(accruals).HandleAsync(
            new GetAccrualsPagedQuery(
                workspaceId,
                Page: 1,
                PageSize: 10,
                ReversedFromUtc: T1,
                ReversedToUtc: T1,
                ReversalReason: "Target"));

        Assert.True(result.IsSuccess);
        Assert.Equal(1, result.Value!.TotalCount);
        Assert.Equal(match.Id, Assert.Single(result.Value.Items).Id);
        Assert.Equal("Target", accruals.LastListedPagedReversalReason);
        Assert.Equal(T1, accruals.LastListedReversedFromUtc);
    }

    [Fact]
    public async Task List_equal_created_at_orders_by_id_descending()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var workspace = new FinanceWorkspaceId(workspaceId);
        var lowerId = new AccrualId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var higherId = new AccrualId(Guid.Parse("99999999-9999-9999-9999-999999999999"));

        await accruals.AddAsync(Accrual.Create(
            lowerId,
            workspace,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Lower id",
            sourceInvoiceId: null,
            T0));
        await accruals.AddAsync(Accrual.Create(
            higherId,
            workspace,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Higher id",
            sourceInvoiceId: null,
            T0));

        var result = await new GetAccrualsHandler(accruals).HandleAsync(
            new GetAccrualsQuery(workspaceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(higherId.Value, result.Value[0].Id);
        Assert.Equal(lowerId.Value, result.Value[1].Id);
    }

    [Fact]
    public async Task List_maps_accrual_dto_fields_including_nullable_source()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        clock.UtcNow = T0;
        var created = await CreateAccrualAsync(
            accruals,
            workspaces,
            clock,
            workspaceId,
            type: "Expense",
            amount: 42.5m,
            currency: "usd",
            recognitionDate: RecognitionDateAlt,
            description: "  Mapped accrual  ",
            sourceInvoiceId: SourceInvoiceId);

        var result = await new GetAccrualsHandler(accruals).HandleAsync(
            new GetAccrualsQuery(workspaceId));

        Assert.True(result.IsSuccess);
        var dto = Assert.Single(result.Value!);
        Assert.Equal(created.Id, dto.Id);
        Assert.Equal(workspaceId, dto.FinanceWorkspaceId);
        Assert.Equal(nameof(AccrualType.Expense), dto.Type);
        Assert.Equal(42.5m, dto.Amount);
        Assert.Equal("USD", dto.Currency);
        Assert.Equal(RecognitionDateAlt, dto.RecognitionDateUtc);
        Assert.Equal("Mapped accrual", dto.Description);
        Assert.Equal(SourceInvoiceId, dto.SourceInvoiceId);
        Assert.Equal(nameof(AccrualStatus.Draft), dto.Status);
        Assert.Equal(T0, dto.CreatedAtUtc);
        Assert.Equal(T0, dto.UpdatedAtUtc);
        Assert.Null(dto.RecognizedAtUtc);
        Assert.Null(dto.ReversedAtUtc);
        Assert.Null(dto.ReversalReason);
    }

    [Fact]
    public async Task List_rejects_empty_workspace_id()
    {
        var (accruals, _, _) = CreateHarness();

        var result = await new GetAccrualsHandler(accruals).HandleAsync(
            new GetAccrualsQuery(Guid.Empty));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListByWorkspaceCallCount);
    }

    [Fact]
    public async Task ListByInvoice_returns_all_matching_source_invoice_accruals()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var otherInvoiceId = Guid.Parse("33333333-3333-3333-3333-333333333333");

        clock.UtcNow = T0;
        var older = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Older", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T1;
        var newer = await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Newer", sourceInvoiceId: SourceInvoiceId);
        clock.UtcNow = T2;
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Other invoice", sourceInvoiceId: otherInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceId, description: "Null source");

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(workspaceId, SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(newer.Id, result.Value[0].Id);
        Assert.Equal(older.Id, result.Value[1].Id);
        Assert.Equal(1, accruals.ListBySourceInvoiceCallCount);
        Assert.Equal(workspaceId, accruals.LastListedWorkspaceId!.Value.Value);
        Assert.Equal(SourceInvoiceId, accruals.LastListedSourceInvoiceId!.Value.Value);
    }

    [Fact]
    public async Task ListByInvoice_empty_returns_empty_list()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, description: "Null source");

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(workspaceId, SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!);
        Assert.Equal(1, accruals.ListBySourceInvoiceCallCount);
    }

    [Fact]
    public async Task ListByInvoice_excludes_other_workspace()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceA = await SeedWorkspaceAsync(workspaces, clock);
        var workspaceB = await SeedWorkspaceAsync(
            workspaces,
            clock,
            Guid.Parse("cccccccc-3333-3333-3333-333333333333"),
            Guid.Parse("dddddddd-4444-4444-4444-444444444444"),
            "Other");

        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceA, description: "A", sourceInvoiceId: SourceInvoiceId);
        await CreateAccrualAsync(
            accruals, workspaces, clock, workspaceB, description: "B", sourceInvoiceId: SourceInvoiceId);

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(workspaceA, SourceInvoiceId));

        Assert.True(result.IsSuccess);
        var dto = Assert.Single(result.Value!);
        Assert.Equal("A", dto.Description);
        Assert.Equal(workspaceA, dto.FinanceWorkspaceId);
    }

    [Fact]
    public async Task ListByInvoice_equal_created_at_orders_by_id_descending()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var workspace = new FinanceWorkspaceId(workspaceId);
        var sourceInvoiceId = new InvoiceId(SourceInvoiceId);
        var lowerId = new AccrualId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var higherId = new AccrualId(Guid.Parse("99999999-9999-9999-9999-999999999999"));

        await accruals.AddAsync(Accrual.Create(
            lowerId,
            workspace,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Lower id",
            sourceInvoiceId,
            T0));
        await accruals.AddAsync(Accrual.Create(
            higherId,
            workspace,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Higher id",
            sourceInvoiceId,
            T0));

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(workspaceId, SourceInvoiceId));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
        Assert.Equal(higherId.Value, result.Value[0].Id);
        Assert.Equal(lowerId.Value, result.Value[1].Id);
    }

    [Fact]
    public async Task ListByInvoice_maps_accrual_dto_fields()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        clock.UtcNow = T0;
        var created = await CreateAccrualAsync(
            accruals,
            workspaces,
            clock,
            workspaceId,
            type: "Expense",
            amount: 42.5m,
            currency: "usd",
            recognitionDate: RecognitionDateAlt,
            description: "  Mapped by invoice  ",
            sourceInvoiceId: SourceInvoiceId);

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(workspaceId, SourceInvoiceId));

        Assert.True(result.IsSuccess);
        var dto = Assert.Single(result.Value!);
        Assert.Equal(created.Id, dto.Id);
        Assert.Equal(workspaceId, dto.FinanceWorkspaceId);
        Assert.Equal(nameof(AccrualType.Expense), dto.Type);
        Assert.Equal(42.5m, dto.Amount);
        Assert.Equal("USD", dto.Currency);
        Assert.Equal(RecognitionDateAlt, dto.RecognitionDateUtc);
        Assert.Equal("Mapped by invoice", dto.Description);
        Assert.Equal(SourceInvoiceId, dto.SourceInvoiceId);
        Assert.Equal(nameof(AccrualStatus.Draft), dto.Status);
        Assert.Equal(T0, dto.CreatedAtUtc);
        Assert.Equal(T0, dto.UpdatedAtUtc);
        Assert.Null(dto.RecognizedAtUtc);
        Assert.Null(dto.ReversedAtUtc);
        Assert.Null(dto.ReversalReason);
    }

    [Fact]
    public async Task ListByInvoice_rejects_empty_workspace_id()
    {
        var (accruals, _, _) = CreateHarness();

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(Guid.Empty, SourceInvoiceId));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListBySourceInvoiceCallCount);
    }

    [Fact]
    public async Task ListByInvoice_rejects_empty_invoice_id()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);

        var result = await new GetAccrualsByInvoiceHandler(accruals).HandleAsync(
            new GetAccrualsByInvoiceQuery(workspaceId, Guid.Empty));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(0, accruals.ListBySourceInvoiceCallCount);
    }

    [Fact]
    public async Task ChangeType_updates_and_saves_once()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId, type: "Revenue");
        clock.UtcNow = T1;
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new ChangeAccrualTypeHandler(accruals, clock).HandleAsync(
            new ChangeAccrualTypeCommand(workspaceId, created.Id, "Expense"));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(AccrualType.Expense), result.Value!.Type);
        Assert.Equal(T1, result.Value.UpdatedAtUtc);
        Assert.Equal(savesBefore + 1, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task ChangeAmount_updates_amount()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ChangeAccrualAmountHandler(accruals, clock).HandleAsync(
            new ChangeAccrualAmountCommand(workspaceId, created.Id, 175.25m));

        Assert.True(result.IsSuccess);
        Assert.Equal(175.25m, result.Value!.Amount);
        Assert.Equal(T1, result.Value.UpdatedAtUtc);
    }

    [Fact]
    public async Task ChangeCurrency_updates_currency()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ChangeAccrualCurrencyHandler(accruals, clock).HandleAsync(
            new ChangeAccrualCurrencyCommand(workspaceId, created.Id, "usd"));

        Assert.True(result.IsSuccess);
        Assert.Equal("USD", result.Value!.Currency);
    }

    [Fact]
    public async Task ChangeRecognitionDate_updates_date()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ChangeAccrualRecognitionDateHandler(accruals, clock).HandleAsync(
            new ChangeAccrualRecognitionDateCommand(workspaceId, created.Id, RecognitionDateAlt));

        Assert.True(result.IsSuccess);
        Assert.Equal(RecognitionDateAlt, result.Value!.RecognitionDateUtc);
    }

    [Fact]
    public async Task ChangeDescription_trims_and_updates()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var result = await new ChangeAccrualDescriptionHandler(accruals, clock).HandleAsync(
            new ChangeAccrualDescriptionCommand(workspaceId, created.Id, "  Updated  "));

        Assert.True(result.IsSuccess);
        Assert.Equal("Updated", result.Value!.Description);
    }

    [Fact]
    public async Task ChangeSourceInvoice_sets_and_clears()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;

        var set = await new ChangeAccrualSourceInvoiceHandler(accruals, clock).HandleAsync(
            new ChangeAccrualSourceInvoiceCommand(workspaceId, created.Id, SourceInvoiceId));
        Assert.True(set.IsSuccess);
        Assert.Equal(SourceInvoiceId, set.Value!.SourceInvoiceId);

        clock.UtcNow = T2;
        var clear = await new ChangeAccrualSourceInvoiceHandler(accruals, clock).HandleAsync(
            new ChangeAccrualSourceInvoiceCommand(workspaceId, created.Id, null));
        Assert.True(clear.IsSuccess);
        Assert.Null(clear.Value!.SourceInvoiceId);
        Assert.Equal(T2, clear.Value.UpdatedAtUtc);
    }

    [Fact]
    public async Task Mutation_missing_aggregate_returns_NotFound_without_save()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new ChangeAccrualAmountHandler(accruals, clock).HandleAsync(
            new ChangeAccrualAmountCommand(workspaceId, Guid.NewGuid(), 1m));

        Assert.Equal(ApplicationErrorKind.NotFound, result.ErrorKind);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Recognize_transitions_draft_and_uses_clock()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, created.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(AccrualStatus.Recognized), result.Value!.Status);
        Assert.Equal(T1, result.Value.RecognizedAtUtc);
        Assert.Equal(T1, result.Value.UpdatedAtUtc);
        Assert.Equal(savesBefore + 1, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Recognize_repeat_returns_Conflict_without_save()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var recognized = await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new RecognizeAccrualHandler(accruals, clock).HandleAsync(
            new RecognizeAccrualCommand(workspaceId, recognized.Id));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Mutation_after_recognize_returns_Conflict()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var recognized = await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new ChangeAccrualAmountHandler(accruals, clock).HandleAsync(
            new ChangeAccrualAmountCommand(workspaceId, recognized.Id, 1m));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Reverse_transitions_recognized_and_trims_reason()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var recognized = await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T2;

        var result = await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, recognized.Id, "  Wrong period  "));

        Assert.True(result.IsSuccess);
        Assert.Equal(nameof(AccrualStatus.Reversed), result.Value!.Status);
        Assert.Equal(T2, result.Value.ReversedAtUtc);
        Assert.Equal("Wrong period", result.Value.ReversalReason);
        Assert.Equal(T1, result.Value.RecognizedAtUtc);
    }

    [Fact]
    public async Task Reverse_draft_returns_Conflict()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var created = await CreateAccrualAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T1;
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, created.Id, "No"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Reverse_repeat_returns_Conflict()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var recognized = await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        Assert.True((await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, recognized.Id, "First"))).IsSuccess);
        var savesBefore = accruals.SaveChangesCallCount;
        clock.UtcNow = T2.AddHours(1);

        var result = await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, recognized.Id, "Second"));

        Assert.Equal(ApplicationErrorKind.Conflict, result.ErrorKind);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public async Task Reverse_blank_reason_returns_ValidationFailed()
    {
        var (accruals, workspaces, clock) = CreateHarness();
        var workspaceId = await SeedWorkspaceAsync(workspaces, clock);
        var recognized = await CreateRecognizedAsync(accruals, workspaces, clock, workspaceId);
        clock.UtcNow = T2;
        var savesBefore = accruals.SaveChangesCallCount;

        var result = await new ReverseAccrualHandler(accruals, clock).HandleAsync(
            new ReverseAccrualCommand(workspaceId, recognized.Id, "   "));

        Assert.Equal(ApplicationErrorKind.ValidationFailed, result.ErrorKind);
        Assert.Equal(savesBefore, accruals.SaveChangesCallCount);
    }

    [Fact]
    public void AddFinanceAccrualApplication_registers_handlers()
    {
        var services = new ServiceCollection();
        services.AddFinanceAccrualApplication();

        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(CreateAccrualHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetAccrualHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetAccrualsHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(GetAccrualsByInvoiceHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ChangeAccrualTypeHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ChangeAccrualAmountHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ChangeAccrualCurrencyHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ChangeAccrualRecognitionDateHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ChangeAccrualDescriptionHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ChangeAccrualSourceInvoiceHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(RecognizeAccrualHandler));
        Assert.Contains(services, descriptor => descriptor.ServiceType == typeof(ReverseAccrualHandler));
    }
}
