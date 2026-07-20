using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Accruals;

public sealed class AccrualTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 20, 8, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 20, 9, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 20, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset RecognitionPast =
        new(2026, 1, 15, 0, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset RecognitionFuture =
        new(2026, 12, 31, 0, 0, 0, TimeSpan.Zero);

    private static readonly FinanceWorkspaceId WorkspaceId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    private static readonly InvoiceId SourceInvoiceId =
        new(Guid.Parse("22222222-2222-2222-2222-222222222222"));

    private static readonly Currency Uah = new("uah");

    private static Accrual CreateDraft(
        AccrualType type = AccrualType.Revenue,
        decimal amount = 100m,
        Currency? currency = null,
        DateTimeOffset? recognitionDate = null,
        string description = " Monthly recognition ",
        InvoiceId? sourceInvoiceId = null) =>
        Accrual.Create(
            AccrualId.New(),
            WorkspaceId,
            type,
            amount,
            currency ?? Uah,
            recognitionDate ?? RecognitionPast,
            description,
            sourceInvoiceId,
            T0);

    private static Accrual CreateRecognized()
    {
        var accrual = CreateDraft(description: "Service recognition");
        accrual.ClearDomainEvents();
        accrual.Recognize(T1);
        return accrual;
    }

    [Fact]
    public void Create_produces_draft_revenue_with_normalized_state_and_event()
    {
        var id = AccrualId.New();

        var accrual = Accrual.Create(
            id,
            WorkspaceId,
            AccrualType.Revenue,
            250.50m,
            new Currency("eur"),
            RecognitionPast,
            "  Q1 revenue  ",
            sourceInvoiceId: null,
            T0);

        Assert.Equal(id, accrual.Id);
        Assert.Equal(WorkspaceId, accrual.FinanceWorkspaceId);
        Assert.Equal(AccrualType.Revenue, accrual.Type);
        Assert.Equal(250.50m, accrual.Amount);
        Assert.Equal("EUR", accrual.Currency.Code);
        Assert.Equal(RecognitionPast, accrual.RecognitionDate);
        Assert.Equal("Q1 revenue", accrual.Description);
        Assert.Null(accrual.SourceInvoiceId);
        Assert.Equal(AccrualStatus.Draft, accrual.Status);
        Assert.Equal(T0, accrual.CreatedAt);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Null(accrual.RecognizedAt);
        Assert.Null(accrual.ReversedAt);
        Assert.Null(accrual.ReversalReason);

        var created = Assert.IsType<AccrualCreated>(Assert.Single(accrual.DomainEvents));
        Assert.Equal(id, created.AccrualId);
        Assert.Equal(WorkspaceId, created.FinanceWorkspaceId);
        Assert.Equal(AccrualType.Revenue, created.Type);
        Assert.Equal(250.50m, created.Amount);
        Assert.Equal("EUR", created.CurrencyCode);
        Assert.Equal(RecognitionPast, created.RecognitionDate);
        Assert.Equal(T0, created.OccurredAt);
    }

    [Fact]
    public void Create_produces_draft_expense()
    {
        var accrual = CreateDraft(type: AccrualType.Expense, description: "Office rent");

        Assert.Equal(AccrualType.Expense, accrual.Type);
        Assert.Equal(AccrualStatus.Draft, accrual.Status);
    }

    [Fact]
    public void Create_rejects_default_accrual_id()
    {
        Assert.Throws<ArgumentException>(() =>
            Accrual.Create(
                default,
                WorkspaceId,
                AccrualType.Revenue,
                10m,
                Uah,
                RecognitionPast,
                "Desc",
                null,
                T0));
    }

    [Fact]
    public void Create_rejects_default_finance_workspace_id()
    {
        Assert.Throws<ArgumentException>(() =>
            Accrual.Create(
                AccrualId.New(),
                default,
                AccrualType.Revenue,
                10m,
                Uah,
                RecognitionPast,
                "Desc",
                null,
                T0));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-0.01)]
    public void Create_rejects_non_positive_amount(decimal amount)
    {
        Assert.Throws<ArgumentException>(() => CreateDraft(amount: amount));
    }

    [Fact]
    public void Create_rejects_blank_currency()
    {
        Assert.Throws<ArgumentException>(() =>
            CreateDraft(currency: new Currency("  ")));
    }

    [Fact]
    public void Create_accepts_past_and_future_recognition_dates()
    {
        var past = CreateDraft(recognitionDate: RecognitionPast);
        var future = CreateDraft(recognitionDate: RecognitionFuture);

        Assert.Equal(RecognitionPast, past.RecognitionDate);
        Assert.Equal(RecognitionFuture, future.RecognitionDate);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_description(string? description)
    {
        Assert.Throws<ArgumentException>(() => CreateDraft(description: description!));
    }

    [Fact]
    public void Create_rejects_overlength_description()
    {
        var description = new string('A', Accrual.DescriptionMaxLength + 1);
        Assert.Throws<ArgumentException>(() => CreateDraft(description: description));
    }

    [Fact]
    public void Create_accepts_optional_source_invoice_id()
    {
        var accrual = CreateDraft(sourceInvoiceId: SourceInvoiceId);

        Assert.Equal(SourceInvoiceId, accrual.SourceInvoiceId);
    }

    [Fact]
    public void Create_rejects_undefined_type()
    {
        Assert.Throws<ArgumentException>(() =>
            CreateDraft(type: (AccrualType)99));
    }

    [Fact]
    public void ChangeType_updates_value_and_timestamp()
    {
        var accrual = CreateDraft(type: AccrualType.Revenue);
        accrual.ClearDomainEvents();

        accrual.ChangeType(AccrualType.Expense, T1);

        Assert.Equal(AccrualType.Expense, accrual.Type);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeType_with_same_value_is_noop()
    {
        var accrual = CreateDraft(type: AccrualType.Revenue);
        accrual.ClearDomainEvents();

        accrual.ChangeType(AccrualType.Revenue, T1);

        Assert.Equal(AccrualType.Revenue, accrual.Type);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeAmount_updates_value_and_timestamp()
    {
        var accrual = CreateDraft(amount: 100m);
        accrual.ClearDomainEvents();

        accrual.ChangeAmount(175.25m, T1);

        Assert.Equal(175.25m, accrual.Amount);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeAmount_with_same_value_is_noop()
    {
        var accrual = CreateDraft(amount: 100m);
        accrual.ClearDomainEvents();

        accrual.ChangeAmount(100m, T1);

        Assert.Equal(100m, accrual.Amount);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeCurrency_updates_value_and_timestamp()
    {
        var accrual = CreateDraft(currency: Uah);
        accrual.ClearDomainEvents();

        accrual.ChangeCurrency(new Currency("usd"), T1);

        Assert.Equal("USD", accrual.Currency.Code);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeCurrency_with_equivalent_normalized_value_is_noop()
    {
        var accrual = CreateDraft(currency: new Currency("uah"));
        accrual.ClearDomainEvents();

        accrual.ChangeCurrency(new Currency("UAH"), T1);

        Assert.Equal("UAH", accrual.Currency.Code);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeRecognitionDate_updates_value_and_timestamp()
    {
        var accrual = CreateDraft(recognitionDate: RecognitionPast);
        accrual.ClearDomainEvents();

        accrual.ChangeRecognitionDate(RecognitionFuture, T1);

        Assert.Equal(RecognitionFuture, accrual.RecognitionDate);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeRecognitionDate_with_same_value_is_noop()
    {
        var accrual = CreateDraft(recognitionDate: RecognitionPast);
        accrual.ClearDomainEvents();

        accrual.ChangeRecognitionDate(RecognitionPast, T1);

        Assert.Equal(RecognitionPast, accrual.RecognitionDate);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeDescription_trims_and_updates()
    {
        var accrual = CreateDraft(description: "Original");
        accrual.ClearDomainEvents();

        accrual.ChangeDescription("  Updated desc  ", T1);

        Assert.Equal("Updated desc", accrual.Description);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeDescription_with_equivalent_normalized_value_is_noop()
    {
        var accrual = CreateDraft(description: "Same");
        accrual.ClearDomainEvents();

        accrual.ChangeDescription("  Same  ", T1);

        Assert.Equal("Same", accrual.Description);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeSourceInvoice_sets_invoice_id()
    {
        var accrual = CreateDraft(sourceInvoiceId: null);
        accrual.ClearDomainEvents();

        accrual.ChangeSourceInvoice(SourceInvoiceId, T1);

        Assert.Equal(SourceInvoiceId, accrual.SourceInvoiceId);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeSourceInvoice_clears_invoice_id()
    {
        var accrual = CreateDraft(sourceInvoiceId: SourceInvoiceId);
        accrual.ClearDomainEvents();

        accrual.ChangeSourceInvoice(null, T1);

        Assert.Null(accrual.SourceInvoiceId);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void ChangeSourceInvoice_with_same_value_is_noop()
    {
        var accrual = CreateDraft(sourceInvoiceId: SourceInvoiceId);
        accrual.ClearDomainEvents();

        accrual.ChangeSourceInvoice(SourceInvoiceId, T1);

        Assert.Equal(SourceInvoiceId, accrual.SourceInvoiceId);
        Assert.Equal(T0, accrual.UpdatedAt);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void Draft_mutations_reject_timestamp_before_created_at()
    {
        var accrual = CreateDraft();
        var before = T0.AddMinutes(-1);

        Assert.Throws<ArgumentException>(() => accrual.ChangeAmount(200m, before));
    }

    [Fact]
    public void Recognize_transitions_draft_to_recognized_with_event()
    {
        var accrual = CreateDraft(description: "Recognize me");
        accrual.ClearDomainEvents();

        accrual.Recognize(T1);

        Assert.Equal(AccrualStatus.Recognized, accrual.Status);
        Assert.Equal(T1, accrual.RecognizedAt);
        Assert.Equal(T1, accrual.UpdatedAt);
        Assert.Null(accrual.ReversedAt);
        Assert.Null(accrual.ReversalReason);

        var recognized = Assert.IsType<AccrualRecognized>(Assert.Single(accrual.DomainEvents));
        Assert.Equal(accrual.Id, recognized.AccrualId);
        Assert.Equal(WorkspaceId, recognized.FinanceWorkspaceId);
        Assert.Equal(T1, recognized.OccurredAt);
    }

    [Fact]
    public void Recognize_rejects_second_call()
    {
        var accrual = CreateRecognized();
        accrual.ClearDomainEvents();

        Assert.Throws<InvalidOperationException>(() => accrual.Recognize(T2));
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void Recognize_rejects_reversed_accrual()
    {
        var accrual = CreateRecognized();
        accrual.Reverse("Correction", T2);
        accrual.ClearDomainEvents();

        Assert.Throws<InvalidOperationException>(() => accrual.Recognize(T2.AddHours(1)));
    }

    [Fact]
    public void Financial_and_source_mutations_rejected_after_recognized()
    {
        var accrual = CreateRecognized();
        accrual.ClearDomainEvents();

        Assert.Throws<InvalidOperationException>(() => accrual.ChangeType(AccrualType.Expense, T2));
        Assert.Throws<InvalidOperationException>(() => accrual.ChangeAmount(1m, T2));
        Assert.Throws<InvalidOperationException>(() => accrual.ChangeCurrency(new Currency("usd"), T2));
        Assert.Throws<InvalidOperationException>(() =>
            accrual.ChangeRecognitionDate(RecognitionFuture, T2));
        Assert.Throws<InvalidOperationException>(() => accrual.ChangeDescription("x", T2));
        Assert.Throws<InvalidOperationException>(() =>
            accrual.ChangeSourceInvoice(SourceInvoiceId, T2));
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void Reverse_transitions_recognized_to_reversed_with_event()
    {
        var accrual = CreateRecognized();
        accrual.ClearDomainEvents();

        accrual.Reverse("  Wrong period  ", T2);

        Assert.Equal(AccrualStatus.Reversed, accrual.Status);
        Assert.Equal(T1, accrual.RecognizedAt);
        Assert.Equal(T2, accrual.ReversedAt);
        Assert.Equal("Wrong period", accrual.ReversalReason);
        Assert.Equal(T2, accrual.UpdatedAt);

        var reversed = Assert.IsType<AccrualReversed>(Assert.Single(accrual.DomainEvents));
        Assert.Equal(accrual.Id, reversed.AccrualId);
        Assert.Equal(WorkspaceId, reversed.FinanceWorkspaceId);
        Assert.Equal("Wrong period", reversed.ReversalReason);
        Assert.Equal(T2, reversed.OccurredAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Reverse_rejects_blank_reason(string? reason)
    {
        var accrual = CreateRecognized();

        Assert.Throws<ArgumentException>(() => accrual.Reverse(reason!, T2));
    }

    [Fact]
    public void Reverse_rejects_overlength_reason()
    {
        var accrual = CreateRecognized();
        var reason = new string('R', Accrual.ReversalReasonMaxLength + 1);

        Assert.Throws<ArgumentException>(() => accrual.Reverse(reason, T2));
    }

    [Fact]
    public void Reverse_rejects_draft()
    {
        var accrual = CreateDraft();
        accrual.ClearDomainEvents();

        Assert.Throws<InvalidOperationException>(() => accrual.Reverse("No", T1));
        Assert.Equal(AccrualStatus.Draft, accrual.Status);
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void Reverse_rejects_second_call()
    {
        var accrual = CreateRecognized();
        accrual.Reverse("First", T2);
        accrual.ClearDomainEvents();

        Assert.Throws<InvalidOperationException>(() => accrual.Reverse("Second", T2.AddHours(1)));
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void Reversed_accrual_is_immutable()
    {
        var accrual = CreateRecognized();
        accrual.Reverse("Done", T2);
        accrual.ClearDomainEvents();
        var later = T2.AddHours(1);

        Assert.Throws<InvalidOperationException>(() => accrual.ChangeAmount(1m, later));
        Assert.Throws<InvalidOperationException>(() => accrual.Recognize(later));
        Assert.Throws<InvalidOperationException>(() => accrual.Reverse("Again", later));
        Assert.Empty(accrual.DomainEvents);
    }

    [Fact]
    public void Event_order_create_recognize_reverse_and_clearing()
    {
        var accrual = CreateDraft(description: "Lifecycle");
        Assert.IsType<AccrualCreated>(Assert.Single(accrual.DomainEvents));

        accrual.ClearDomainEvents();
        Assert.Empty(accrual.DomainEvents);

        accrual.Recognize(T1);
        Assert.IsType<AccrualRecognized>(Assert.Single(accrual.DomainEvents));

        accrual.ClearDomainEvents();
        accrual.Reverse("Undo", T2);
        Assert.IsType<AccrualReversed>(Assert.Single(accrual.DomainEvents));

        accrual.ClearDomainEvents();
        Assert.Empty(accrual.DomainEvents);
    }
}
