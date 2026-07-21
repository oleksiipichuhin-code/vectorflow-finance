using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class AccrualRepositoryTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 20, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 20, 11, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 20, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset RecognitionDate =
        new(2026, 7, 31, 0, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private AccrualRepository _repository = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _repository = new AccrualRepository(_dbContext);

        _workspaceA = await SeedWorkspaceAsync(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            "Workspace A");
        _workspaceB = await SeedWorkspaceAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            Guid.Parse("44444444-4444-4444-4444-444444444444"),
            "Workspace B");
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Add_and_GetById_round_trips_draft_accrual()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        var accrual = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            125.50m,
            new Currency("uah"),
            RecognitionDate,
            "  July revenue  ",
            sourceInvoiceId,
            T0);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Equal(accrual.Id, loaded.Id);
        Assert.Equal(_workspaceA, loaded.FinanceWorkspaceId);
        Assert.Equal(AccrualType.Revenue, loaded.Type);
        Assert.Equal(125.50m, loaded.Amount);
        Assert.Equal("UAH", loaded.Currency.Code);
        Assert.Equal(RecognitionDate, loaded.RecognitionDate);
        Assert.Equal("July revenue", loaded.Description);
        Assert.Equal(sourceInvoiceId, loaded.SourceInvoiceId);
        Assert.Equal(AccrualStatus.Draft, loaded.Status);
        Assert.Equal(T0, loaded.CreatedAt);
        Assert.Equal(T0, loaded.UpdatedAt);
        Assert.Null(loaded.RecognizedAt);
        Assert.Null(loaded.ReversedAt);
        Assert.Null(loaded.ReversalReason);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task GetById_wrong_workspace_returns_null()
    {
        var accrual = CreateDraft(_workspaceA, AccrualType.Expense, 10m, "Scoped");

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        var loaded = await _repository.GetByIdAsync(_workspaceB, accrual.Id);

        Assert.Null(loaded);
    }

    [Fact]
    public async Task ListByWorkspace_returns_only_workspace_newest_first()
    {
        var older = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Older",
            sourceInvoiceId: null,
            T0);
        var newer = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Newer",
            sourceInvoiceId: null,
            T1);
        var other = Accrual.Create(
            AccrualId.New(),
            _workspaceB,
            AccrualType.Revenue,
            30m,
            new Currency("USD"),
            RecognitionDate,
            "Other",
            sourceInvoiceId: null,
            T2);

        await _repository.AddAsync(older);
        await _repository.AddAsync(newer);
        await _repository.AddAsync(other);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(2, listed.Count);
        Assert.Equal(newer.Id, listed[0].Id);
        Assert.Equal(older.Id, listed[1].Id);
    }

    [Fact]
    public async Task ListByWorkspace_empty_returns_empty_collection()
    {
        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Empty(listed);
    }

    [Fact]
    public async Task ListPaged_returns_workspace_page_newest_first_with_total()
    {
        var older = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Older",
            sourceInvoiceId: null,
            T0);
        var newer = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Newer",
            sourceInvoiceId: null,
            T1);
        var other = Accrual.Create(
            AccrualId.New(),
            _workspaceB,
            AccrualType.Revenue,
            30m,
            new Currency("USD"),
            RecognitionDate,
            "Other",
            sourceInvoiceId: null,
            T2);

        await _repository.AddAsync(older);
        await _repository.AddAsync(newer);
        await _repository.AddAsync(other);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10);

        Assert.Equal(2, totalCount);
        Assert.Equal(2, items.Count);
        Assert.Equal(newer.Id, items[0].Id);
        Assert.Equal(older.Id, items[1].Id);
    }

    [Fact]
    public async Task ListPaged_empty_returns_empty_items_with_zero_total()
    {
        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10);

        Assert.Empty(items);
        Assert.Equal(0, totalCount);
    }

    [Fact]
    public async Task ListPaged_orders_and_pages_deterministically()
    {
        var first = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 1m, new Currency("UAH"),
            RecognitionDate, "1", null, T0);
        var second = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 2m, new Currency("UAH"),
            RecognitionDate, "2", null, T1);
        var third = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 3m, new Currency("UAH"),
            RecognitionDate, "3", null, T2);

        await _repository.AddAsync(first);
        await _repository.AddAsync(second);
        await _repository.AddAsync(third);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);

        var (page1, total1) = await repo.ListPagedAsync(_workspaceA, page: 1, pageSize: 2);
        var (page2, total2) = await repo.ListPagedAsync(_workspaceA, page: 2, pageSize: 2);
        var (beyond, totalBeyond) = await repo.ListPagedAsync(_workspaceA, page: 3, pageSize: 2);
        var (pageSizeOne, totalOne) = await repo.ListPagedAsync(_workspaceA, page: 1, pageSize: 1);

        Assert.Equal(3, total1);
        Assert.Equal(3, total2);
        Assert.Equal(3, totalBeyond);
        Assert.Equal(3, totalOne);
        Assert.Equal(new[] { third.Id, second.Id }, page1.Select(a => a.Id).ToArray());
        Assert.Equal(new[] { first.Id }, page2.Select(a => a.Id).ToArray());
        Assert.Empty(beyond);
        Assert.Equal(third.Id, Assert.Single(pageSizeOne).Id);
    }

    [Fact]
    public async Task ListPaged_equal_created_at_orders_by_id_descending()
    {
        var lowerId = new AccrualId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var higherId = new AccrualId(Guid.Parse("99999999-9999-9999-9999-999999999999"));
        var lower = Accrual.Create(
            lowerId, _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Lower", null, T0);
        var higher = Accrual.Create(
            higherId, _workspaceA, AccrualType.Expense, 20m, new Currency("UAH"),
            RecognitionDate, "Higher", null, T0);

        await _repository.AddAsync(lower);
        await _repository.AddAsync(higher);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10);

        Assert.Equal(2, totalCount);
        Assert.Equal(higherId, items[0].Id);
        Assert.Equal(lowerId, items[1].Id);
    }

    [Fact]
    public async Task ListPaged_partial_final_page_and_stable_reread()
    {
        var a = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 1m, new Currency("UAH"),
            RecognitionDate, "A", null, T0);
        var b = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 2m, new Currency("UAH"),
            RecognitionDate, "B", null, T1);
        var c = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 3m, new Currency("UAH"),
            RecognitionDate, "C", null, T2);

        await _repository.AddAsync(a);
        await _repository.AddAsync(b);
        await _repository.AddAsync(c);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);
        var (page2a, totalA) = await repo.ListPagedAsync(_workspaceA, page: 2, pageSize: 2);
        var (page2b, totalB) = await repo.ListPagedAsync(_workspaceA, page: 2, pageSize: 2);

        Assert.Equal(3, totalA);
        Assert.Equal(3, totalB);
        Assert.Equal(a.Id, Assert.Single(page2a).Id);
        Assert.Equal(page2a.Select(x => x.Id).ToArray(), page2b.Select(x => x.Id).ToArray());
    }

    [Fact]
    public async Task ListPaged_does_not_change_non_paged_list_behavior()
    {
        var accrual = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Only", null, T0);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);
        var listed = await repo.ListByWorkspaceAsync(_workspaceA);
        var (paged, total) = await repo.ListPagedAsync(_workspaceA, page: 1, pageSize: 10);

        Assert.Equal(accrual.Id, Assert.Single(listed).Id);
        Assert.Equal(1, total);
        Assert.Equal(accrual.Id, Assert.Single(paged).Id);
    }

    [Fact]
    public async Task ListPaged_status_Draft_returns_only_drafts()
    {
        var draft = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Draft", null, T0);
        var recognized = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 20m, new Currency("UAH"),
            RecognitionDate, "Recognized", null, T1);
        recognized.Recognize(T2);

        await _repository.AddAsync(draft);
        await _repository.AddAsync(recognized);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, status: AccrualStatus.Draft);

        Assert.Equal(1, totalCount);
        Assert.Equal(draft.Id, Assert.Single(items).Id);
        Assert.Equal(AccrualStatus.Draft, items[0].Status);
    }

    [Fact]
    public async Task ListPaged_status_Recognized_returns_only_recognized()
    {
        var draft = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Draft", null, T0);
        var recognized = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 20m, new Currency("UAH"),
            RecognitionDate, "Recognized", null, T1);
        recognized.Recognize(T2);

        await _repository.AddAsync(draft);
        await _repository.AddAsync(recognized);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, status: AccrualStatus.Recognized);

        Assert.Equal(1, totalCount);
        Assert.Equal(recognized.Id, Assert.Single(items).Id);
        Assert.Equal(AccrualStatus.Recognized, items[0].Status);
    }

    [Fact]
    public async Task ListPaged_status_Reversed_returns_only_reversed()
    {
        var draft = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Draft", null, T0);
        var reversed = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 20m, new Currency("UAH"),
            RecognitionDate, "Reversed", null, T1);
        reversed.Recognize(T1);
        reversed.Reverse("Correction", T2);

        await _repository.AddAsync(draft);
        await _repository.AddAsync(reversed);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, status: AccrualStatus.Reversed);

        Assert.Equal(1, totalCount);
        Assert.Equal(reversed.Id, Assert.Single(items).Id);
        Assert.Equal(AccrualStatus.Reversed, items[0].Status);
    }

    [Fact]
    public async Task ListPaged_null_status_returns_all_statuses()
    {
        var draft = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Draft", null, T0);
        var recognized = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 20m, new Currency("UAH"),
            RecognitionDate, "Recognized", null, T1);
        recognized.Recognize(T2);

        await _repository.AddAsync(draft);
        await _repository.AddAsync(recognized);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, status: null);

        Assert.Equal(2, totalCount);
        Assert.Equal(2, items.Count);
        Assert.Equal(recognized.Id, items[0].Id);
        Assert.Equal(draft.Id, items[1].Id);
    }

    [Fact]
    public async Task ListPaged_status_filter_is_workspace_scoped()
    {
        var draftA = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "A", null, T0);
        var draftB = Accrual.Create(
            AccrualId.New(), _workspaceB, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "B", null, T1);
        var recognizedA = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "A-rec", null, T2);
        recognizedA.Recognize(T2);

        await _repository.AddAsync(draftA);
        await _repository.AddAsync(draftB);
        await _repository.AddAsync(recognizedA);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, status: AccrualStatus.Draft);

        Assert.Equal(1, totalCount);
        Assert.Equal(draftA.Id, Assert.Single(items).Id);
    }

    [Fact]
    public async Task ListPaged_status_filter_pages_after_filter()
    {
        var draftOlder = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "D1", null, T0);
        var draftNewer = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "D2", null, T1);
        var recognized = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "R", null, T2);
        recognized.Recognize(T2);

        await _repository.AddAsync(draftOlder);
        await _repository.AddAsync(draftNewer);
        await _repository.AddAsync(recognized);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);

        var (page1, total1) = await repo.ListPagedAsync(
            _workspaceA, page: 1, pageSize: 1, status: AccrualStatus.Draft);
        var (page2, total2) = await repo.ListPagedAsync(
            _workspaceA, page: 2, pageSize: 1, status: AccrualStatus.Draft);

        Assert.Equal(2, total1);
        Assert.Equal(2, total2);
        Assert.Equal(draftNewer.Id, Assert.Single(page1).Id);
        Assert.Equal(draftOlder.Id, Assert.Single(page2).Id);
    }

    [Fact]
    public async Task ListPaged_status_no_match_returns_empty()
    {
        var draft = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Draft", null, T0);

        await _repository.AddAsync(draft);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, status: AccrualStatus.Recognized);

        Assert.Empty(items);
        Assert.Equal(0, totalCount);
    }

    [Fact]
    public async Task ListPaged_created_from_includes_lower_bound_and_excludes_earlier()
    {
        var earlier = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Early", null, T0);
        var onBound = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "On", null, T1);
        var later = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "Late", null, T2);

        await _repository.AddAsync(earlier);
        await _repository.AddAsync(onBound);
        await _repository.AddAsync(later);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, createdFromUtc: T1);

        Assert.Equal(2, totalCount);
        Assert.Equal(2, items.Count);
        Assert.Equal(later.Id, items[0].Id);
        Assert.Equal(onBound.Id, items[1].Id);
    }

    [Fact]
    public async Task ListPaged_created_to_includes_upper_bound_and_excludes_later()
    {
        var earlier = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Early", null, T0);
        var onBound = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "On", null, T1);
        var later = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "Late", null, T2);

        await _repository.AddAsync(earlier);
        await _repository.AddAsync(onBound);
        await _repository.AddAsync(later);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, createdToUtc: T1);

        Assert.Equal(2, totalCount);
        Assert.Equal(2, items.Count);
        Assert.Equal(onBound.Id, items[0].Id);
        Assert.Equal(earlier.Id, items[1].Id);
    }

    [Fact]
    public async Task ListPaged_created_closed_range_is_inclusive()
    {
        var earlier = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Early", null, T0);
        var mid = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "Mid", null, T1);
        var later = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "Late", null, T2);

        await _repository.AddAsync(earlier);
        await _repository.AddAsync(mid);
        await _repository.AddAsync(later);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, createdFromUtc: T0, createdToUtc: T1);

        Assert.Equal(2, totalCount);
        Assert.Equal(mid.Id, items[0].Id);
        Assert.Equal(earlier.Id, items[1].Id);
    }

    [Fact]
    public async Task ListPaged_created_equal_bounds_match_exact_instant()
    {
        var match = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Match", null, T1);
        var other = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 20m, new Currency("UAH"),
            RecognitionDate, "Other", null, T0);

        await _repository.AddAsync(match);
        await _repository.AddAsync(other);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(_workspaceA, page: 1, pageSize: 10, createdFromUtc: T1, createdToUtc: T1);

        Assert.Equal(1, totalCount);
        Assert.Equal(match.Id, Assert.Single(items).Id);
    }

    [Fact]
    public async Task ListPaged_created_range_no_match_returns_empty()
    {
        var accrual = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Now", null, T0);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(
                _workspaceA,
                page: 1,
                pageSize: 10,
                createdFromUtc: T1,
                createdToUtc: T2);

        Assert.Empty(items);
        Assert.Equal(0, totalCount);
    }

    [Fact]
    public async Task ListPaged_created_range_is_workspace_scoped()
    {
        var inA = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "A", null, T1);
        var inB = Accrual.Create(
            AccrualId.New(), _workspaceB, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "B", null, T1);

        await _repository.AddAsync(inA);
        await _repository.AddAsync(inB);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(
                _workspaceA,
                page: 1,
                pageSize: 10,
                createdFromUtc: T0,
                createdToUtc: T2);

        Assert.Equal(1, totalCount);
        Assert.Equal(inA.Id, Assert.Single(items).Id);
    }

    [Fact]
    public async Task ListPaged_created_range_with_status_applies_both()
    {
        var draftInRange = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "Draft in", null, T1);
        var draftOut = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "Draft out", null, T0);
        var recognizedInRange = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "Recognized in", null, T1);
        recognizedInRange.Recognize(T2);

        await _repository.AddAsync(draftInRange);
        await _repository.AddAsync(draftOut);
        await _repository.AddAsync(recognizedInRange);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(
                _workspaceA,
                page: 1,
                pageSize: 10,
                status: AccrualStatus.Draft,
                createdFromUtc: T1,
                createdToUtc: T2);

        Assert.Equal(1, totalCount);
        Assert.Equal(draftInRange.Id, Assert.Single(items).Id);
        Assert.Equal(AccrualStatus.Draft, items[0].Status);
    }

    [Fact]
    public async Task ListPaged_created_range_pages_after_filter()
    {
        var first = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 10m, new Currency("UAH"),
            RecognitionDate, "1", null, T0);
        var second = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Revenue, 20m, new Currency("UAH"),
            RecognitionDate, "2", null, T1);
        var third = Accrual.Create(
            AccrualId.New(), _workspaceA, AccrualType.Expense, 30m, new Currency("UAH"),
            RecognitionDate, "3", null, T2);
        var outOfRange = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            40m,
            new Currency("UAH"),
            RecognitionDate,
            "Out",
            null,
            new DateTimeOffset(2026, 7, 19, 15, 0, 0, TimeSpan.Zero));

        await _repository.AddAsync(first);
        await _repository.AddAsync(second);
        await _repository.AddAsync(third);
        await _repository.AddAsync(outOfRange);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);

        var (page1, total1) = await repo.ListPagedAsync(
            _workspaceA, page: 1, pageSize: 1, createdFromUtc: T0, createdToUtc: T2);
        var (page2, total2) = await repo.ListPagedAsync(
            _workspaceA, page: 2, pageSize: 1, createdFromUtc: T0, createdToUtc: T2);

        Assert.Equal(3, total1);
        Assert.Equal(3, total2);
        Assert.Equal(third.Id, Assert.Single(page1).Id);
        Assert.Equal(second.Id, Assert.Single(page2).Id);
    }

    [Fact]
    public async Task ListPaged_created_range_matches_offset_equivalent_instant()
    {
        var storedInstant = new DateTimeOffset(2026, 7, 21, 8, 0, 0, TimeSpan.Zero);
        var queryInstant = new DateTimeOffset(2026, 7, 21, 11, 0, 0, TimeSpan.FromHours(3));
        Assert.Equal(storedInstant.UtcTicks, queryInstant.UtcTicks);

        var match = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Offset",
            null,
            storedInstant);
        var earlier = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Before",
            null,
            storedInstant.AddMinutes(-1));

        await _repository.AddAsync(match);
        await _repository.AddAsync(earlier);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var (items, totalCount) = await new AccrualRepository(readContext)
            .ListPagedAsync(
                _workspaceA,
                page: 1,
                pageSize: 10,
                createdFromUtc: queryInstant,
                createdToUtc: queryInstant);

        Assert.Equal(1, totalCount);
        Assert.Equal(match.Id, Assert.Single(items).Id);
    }

    [Fact]
    public async Task ListByWorkspace_equal_created_at_orders_by_id_descending()
    {
        var lowerId = new AccrualId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var higherId = new AccrualId(Guid.Parse("99999999-9999-9999-9999-999999999999"));
        var lower = Accrual.Create(
            lowerId,
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Lower",
            sourceInvoiceId: null,
            T0);
        var higher = Accrual.Create(
            higherId,
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Higher",
            sourceInvoiceId: null,
            T0);

        await _repository.AddAsync(lower);
        await _repository.AddAsync(higher);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(2, listed.Count);
        Assert.Equal(higherId, listed[0].Id);
        Assert.Equal(lowerId, listed[1].Id);
    }

    [Fact]
    public async Task ListByWorkspace_preserves_nullable_source_invoice_id()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        var withSource = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            15m,
            new Currency("UAH"),
            RecognitionDate,
            "With source",
            sourceInvoiceId,
            T0);
        var withoutSource = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            25m,
            new Currency("UAH"),
            RecognitionDate,
            "Without source",
            sourceInvoiceId: null,
            T1);

        await _repository.AddAsync(withSource);
        await _repository.AddAsync(withoutSource);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(2, listed.Count);
        Assert.Null(listed[0].SourceInvoiceId);
        Assert.Equal(sourceInvoiceId, listed[1].SourceInvoiceId);
    }

    [Fact]
    public async Task GetById_after_list_still_round_trips()
    {
        var accrual = CreateDraft(_workspaceA, AccrualType.Revenue, 10m, "After list");

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);
        var listed = await repo.ListByWorkspaceAsync(_workspaceA);
        Assert.Equal(accrual.Id, Assert.Single(listed).Id);

        var loaded = await repo.GetByIdAsync(_workspaceA, accrual.Id);
        Assert.NotNull(loaded);
        Assert.Equal("After list", loaded.Description);
    }

    [Fact]
    public async Task ListBySourceInvoice_returns_all_matching_newest_first()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        var otherInvoiceId = new InvoiceId(Guid.Parse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff"));
        var older = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Older",
            sourceInvoiceId,
            T0);
        var newer = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Newer",
            sourceInvoiceId,
            T1);
        var otherInvoice = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            30m,
            new Currency("UAH"),
            RecognitionDate,
            "Other invoice",
            otherInvoiceId,
            T2);
        var nullSource = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            40m,
            new Currency("UAH"),
            RecognitionDate,
            "Null source",
            sourceInvoiceId: null,
            T2);
        var otherWorkspace = Accrual.Create(
            AccrualId.New(),
            _workspaceB,
            AccrualType.Revenue,
            50m,
            new Currency("UAH"),
            RecognitionDate,
            "Other workspace",
            sourceInvoiceId,
            T2);

        await _repository.AddAsync(older);
        await _repository.AddAsync(newer);
        await _repository.AddAsync(otherInvoice);
        await _repository.AddAsync(nullSource);
        await _repository.AddAsync(otherWorkspace);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext)
            .ListBySourceInvoiceAsync(_workspaceA, sourceInvoiceId);

        Assert.Equal(2, listed.Count);
        Assert.Equal(newer.Id, listed[0].Id);
        Assert.Equal(older.Id, listed[1].Id);
        Assert.All(listed, accrual => Assert.Equal(sourceInvoiceId, accrual.SourceInvoiceId));
    }

    [Fact]
    public async Task ListBySourceInvoice_empty_returns_empty_collection()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa"));
        await _repository.AddAsync(CreateDraft(_workspaceA, AccrualType.Revenue, 10m, "Null source"));
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext)
            .ListBySourceInvoiceAsync(_workspaceA, sourceInvoiceId);

        Assert.Empty(listed);
    }

    [Fact]
    public async Task ListBySourceInvoice_equal_created_at_orders_by_id_descending()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb"));
        var lowerId = new AccrualId(Guid.Parse("11111111-1111-1111-1111-111111111111"));
        var higherId = new AccrualId(Guid.Parse("99999999-9999-9999-9999-999999999999"));
        var lower = Accrual.Create(
            lowerId,
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "Lower",
            sourceInvoiceId,
            T0);
        var higher = Accrual.Create(
            higherId,
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Higher",
            sourceInvoiceId,
            T0);

        await _repository.AddAsync(lower);
        await _repository.AddAsync(higher);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext)
            .ListBySourceInvoiceAsync(_workspaceA, sourceInvoiceId);

        Assert.Equal(2, listed.Count);
        Assert.Equal(higherId, listed[0].Id);
        Assert.Equal(lowerId, listed[1].Id);
    }

    [Fact]
    public async Task ListBySourceInvoice_does_not_require_invoice_row()
    {
        var unknownInvoiceId = new InvoiceId(Guid.Parse("eeeeeeee-ffff-aaaa-bbbb-cccccccccccc"));
        var accrual = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            15m,
            new Currency("UAH"),
            RecognitionDate,
            "No invoice row",
            unknownInvoiceId,
            T0);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        Assert.Equal(0, await _dbContext.Invoices.CountAsync());

        await using var readContext = CreateContext();
        var listed = await new AccrualRepository(readContext)
            .ListBySourceInvoiceAsync(_workspaceA, unknownInvoiceId);

        Assert.Equal(accrual.Id, Assert.Single(listed).Id);
        Assert.Equal(0, await readContext.Invoices.CountAsync());
    }

    [Fact]
    public async Task ListBySourceInvoice_preserves_list_by_workspace_and_get_by_id()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("ffffffff-aaaa-bbbb-cccc-dddddddddddd"));
        var withSource = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            10m,
            new Currency("UAH"),
            RecognitionDate,
            "With source",
            sourceInvoiceId,
            T0);
        var withoutSource = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            20m,
            new Currency("UAH"),
            RecognitionDate,
            "Without source",
            sourceInvoiceId: null,
            T1);

        await _repository.AddAsync(withSource);
        await _repository.AddAsync(withoutSource);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new AccrualRepository(readContext);

        var byInvoice = await repo.ListBySourceInvoiceAsync(_workspaceA, sourceInvoiceId);
        Assert.Equal(withSource.Id, Assert.Single(byInvoice).Id);

        var byWorkspace = await repo.ListByWorkspaceAsync(_workspaceA);
        Assert.Equal(2, byWorkspace.Count);
        Assert.Equal(withoutSource.Id, byWorkspace[0].Id);
        Assert.Equal(withSource.Id, byWorkspace[1].Id);

        var loaded = await repo.GetByIdAsync(_workspaceA, withSource.Id);
        Assert.NotNull(loaded);
        Assert.Equal(sourceInvoiceId, loaded.SourceInvoiceId);
    }

    [Fact]
    public async Task Draft_mutations_persist()
    {
        var accrual = CreateDraft(_workspaceA, AccrualType.Revenue, 10m, "Old");

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        var newRecognition = new DateTimeOffset(2026, 8, 15, 0, 0, 0, TimeSpan.Zero);
        accrual.ChangeType(AccrualType.Expense, T1);
        accrual.ChangeAmount(99.99m, T1);
        accrual.ChangeCurrency(new Currency("USD"), T1);
        accrual.ChangeRecognitionDate(newRecognition, T1);
        accrual.ChangeDescription("Updated description", T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Equal(AccrualType.Expense, loaded.Type);
        Assert.Equal(99.99m, loaded.Amount);
        Assert.Equal("USD", loaded.Currency.Code);
        Assert.Equal(newRecognition, loaded.RecognitionDate);
        Assert.Equal("Updated description", loaded.Description);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Equal(AccrualStatus.Draft, loaded.Status);
    }

    [Fact]
    public async Task SourceInvoiceId_set_persists()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff"));
        var accrual = CreateDraft(_workspaceA, AccrualType.Revenue, 20m, "With source");

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        accrual.ChangeSourceInvoice(sourceInvoiceId, T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Equal(sourceInvoiceId, loaded.SourceInvoiceId);
        Assert.Equal(T1, loaded.UpdatedAt);
    }

    [Fact]
    public async Task SourceInvoiceId_clear_persists()
    {
        var sourceInvoiceId = new InvoiceId(Guid.Parse("cccccccc-dddd-eeee-ffff-000000000000"));
        var accrual = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Expense,
            30m,
            new Currency("EUR"),
            RecognitionDate,
            "Clear source",
            sourceInvoiceId,
            T0);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        accrual.ChangeSourceInvoice(null, T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Null(loaded.SourceInvoiceId);
        Assert.Equal(T1, loaded.UpdatedAt);
    }

    [Fact]
    public async Task Recognize_persists_status_and_timestamps()
    {
        var accrual = CreateDraft(_workspaceA, AccrualType.Revenue, 40m, "Recognize me");

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        accrual.Recognize(T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Equal(AccrualStatus.Recognized, loaded.Status);
        Assert.Equal(T1, loaded.RecognizedAt);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Null(loaded.ReversedAt);
        Assert.Null(loaded.ReversalReason);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task Reverse_persists_status_reason_and_preserves_RecognizedAt()
    {
        var accrual = CreateDraft(_workspaceA, AccrualType.Expense, 50m, "Reverse me");
        accrual.Recognize(T1);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        accrual.Reverse("  Correction required  ", T2);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Equal(AccrualStatus.Reversed, loaded.Status);
        Assert.Equal(T1, loaded.RecognizedAt);
        Assert.Equal(T2, loaded.ReversedAt);
        Assert.Equal("Correction required", loaded.ReversalReason);
        Assert.Equal(T2, loaded.UpdatedAt);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task Decimal_amount_round_trip_without_loss()
    {
        var amount = 123.456789012345678m;
        var accrual = Accrual.Create(
            AccrualId.New(),
            _workspaceA,
            AccrualType.Revenue,
            amount,
            new Currency("UAH"),
            RecognitionDate,
            "Precision",
            sourceInvoiceId: null,
            T0);

        await _repository.AddAsync(accrual);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new AccrualRepository(readContext).GetByIdAsync(_workspaceA, accrual.Id);

        Assert.NotNull(loaded);
        Assert.Equal(amount, loaded.Amount);
    }

    [Fact]
    public async Task Model_contains_accruals_table_index_and_constraints()
    {
        var entity = _dbContext.Model.FindEntityType(typeof(Accrual));

        Assert.NotNull(entity);
        Assert.Equal("Accruals", entity.GetTableName());

        Assert.Contains(
            entity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_Accruals_FinanceWorkspaceId" && !index.IsUnique);

        Assert.DoesNotContain(
            entity.GetIndexes(),
            index => index.Properties.Any(property => property.Name == nameof(Accrual.SourceInvoiceId)));

        var workspaceFk = Assert.Single(
            entity.GetForeignKeys(),
            fk => fk.Properties.Any(property => property.Name == nameof(Accrual.FinanceWorkspaceId)));
        Assert.Equal(DeleteBehavior.Restrict, workspaceFk.DeleteBehavior);
        Assert.Equal(typeof(FinanceWorkspace), workspaceFk.PrincipalEntityType.ClrType);

        Assert.DoesNotContain(
            entity.GetForeignKeys(),
            fk => fk.Properties.Any(property => property.Name == nameof(Accrual.SourceInvoiceId)));

        Assert.Null(entity.FindProperty(nameof(Accrual.DomainEvents)));
    }

    [Fact]
    public async Task MigrateAsync_applies_accrual_schema_on_sqlite()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = new FinanceDbContext(
            new DbContextOptionsBuilder<FinanceDbContext>()
                .UseSqlite(connection)
                .Options);

        await context.Database.MigrateAsync();

        Assert.NotNull(context.Model.FindEntityType(typeof(Accrual)));
        Assert.Contains(
            await context.Database.GetAppliedMigrationsAsync(),
            name => name.Contains("AddAccruals", StringComparison.Ordinal));
    }

    private Accrual CreateDraft(
        FinanceWorkspaceId workspaceId,
        AccrualType type,
        decimal amount,
        string description) =>
        Accrual.Create(
            AccrualId.New(),
            workspaceId,
            type,
            amount,
            new Currency("UAH"),
            RecognitionDate,
            description,
            sourceInvoiceId: null,
            T0);

    private FinanceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<FinanceDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new FinanceDbContext(options);
    }

    private async Task<FinanceWorkspaceId> SeedWorkspaceAsync(
        Guid organizationId,
        Guid platformWorkspaceId,
        string name)
    {
        var workspace = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            new PlatformOrganizationId(organizationId),
            new PlatformWorkspaceId(platformWorkspaceId),
            name,
            "UAH",
            T0);

        _dbContext.FinanceWorkspaces.Add(workspace);
        await _dbContext.SaveChangesAsync();
        return workspace.Id;
    }
}
