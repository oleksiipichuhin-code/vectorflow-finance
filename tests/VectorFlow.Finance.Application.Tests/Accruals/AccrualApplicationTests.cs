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
