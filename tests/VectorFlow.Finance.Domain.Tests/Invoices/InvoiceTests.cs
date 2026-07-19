using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Invoices;

public sealed class InvoiceTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 8, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 9, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset DueSameDay =
        new(2026, 7, 19, 23, 59, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset DueNextDay =
        new(2026, 7, 20, 0, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset DueBeforeIssue =
        new(2026, 7, 18, 12, 0, 0, TimeSpan.Zero);

    private static readonly FinanceWorkspaceId WorkspaceId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    private static readonly CounterpartyReference Counterparty =
        new("crm-partner-100");

    private static readonly Currency Uah = new("uah");

    private static Invoice CreateDraft(
        string documentNumber = " INV-1001 ",
        CounterpartyReference? counterparty = null,
        Currency? currency = null) =>
        Invoice.Create(
            InvoiceId.New(),
            WorkspaceId,
            documentNumber,
            counterparty ?? Counterparty,
            currency ?? Uah,
            T0);

    private static Invoice CreateIssuableDraft()
    {
        var invoice = CreateDraft(documentNumber: "INV-1001");
        invoice.ClearDomainEvents();
        invoice.AddLine(2m, 50.125m, description: "Service", occurredAt: T1);
        invoice.SetDueDate(DueNextDay, T1);
        return invoice;
    }

    [Fact]
    public void Create_produces_draft_with_normalized_state_and_event()
    {
        var id = InvoiceId.New();

        var invoice = Invoice.Create(
            id,
            WorkspaceId,
            "  INV-42  ",
            new CounterpartyReference("  partner-7  "),
            new Currency("eur"),
            T0);

        Assert.Equal(id, invoice.Id);
        Assert.Equal(WorkspaceId, invoice.FinanceWorkspaceId);
        Assert.Equal("INV-42", invoice.DocumentNumber);
        Assert.Equal("partner-7", invoice.CounterpartyReference.Value);
        Assert.Equal("EUR", invoice.Currency.Code);
        Assert.Equal(InvoiceStatus.Draft, invoice.Status);
        Assert.Equal(T0, invoice.CreatedAt);
        Assert.Equal(T0, invoice.UpdatedAt);
        Assert.Null(invoice.IssuedAt);
        Assert.Null(invoice.DueDate);
        Assert.Empty(invoice.Lines);
        Assert.Equal(0m, invoice.TotalAmount);

        var created = Assert.IsType<InvoiceCreated>(Assert.Single(invoice.DomainEvents));
        Assert.Equal(id, created.InvoiceId);
        Assert.Equal(WorkspaceId, created.FinanceWorkspaceId);
        Assert.Equal("INV-42", created.DocumentNumber);
        Assert.Equal(T0, created.OccurredAt);
    }

    [Fact]
    public void Create_rejects_default_invoice_id()
    {
        Assert.Throws<ArgumentException>(() =>
            Invoice.Create(default, WorkspaceId, "INV-1", Counterparty, Uah, T0));
    }

    [Fact]
    public void Create_rejects_default_finance_workspace_id()
    {
        Assert.Throws<ArgumentException>(() =>
            Invoice.Create(InvoiceId.New(), default, "INV-1", Counterparty, Uah, T0));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_document_number(string? documentNumber)
    {
        Assert.Throws<ArgumentException>(() => CreateDraft(documentNumber: documentNumber!));
    }

    [Fact]
    public void Create_rejects_overlength_document_number()
    {
        var documentNumber = new string('A', Invoice.DocumentNumberMaxLength + 1);
        Assert.Throws<ArgumentException>(() => CreateDraft(documentNumber: documentNumber));
    }

    [Fact]
    public void Create_rejects_blank_counterparty_reference()
    {
        Assert.Throws<ArgumentException>(() =>
            Invoice.Create(InvoiceId.New(), WorkspaceId, "INV-1", new CounterpartyReference("  "), Uah, T0));
    }

    [Fact]
    public void Create_rejects_blank_currency()
    {
        Assert.Throws<ArgumentException>(() =>
            Invoice.Create(InvoiceId.New(), WorkspaceId, "INV-1", Counterparty, new Currency("  "), T0));
    }

    [Fact]
    public void ChangeDocumentNumber_updates_value_and_timestamp()
    {
        var invoice = CreateDraft(documentNumber: "INV-1");
        invoice.ClearDomainEvents();

        invoice.ChangeDocumentNumber(" INV-2 ", T1);

        Assert.Equal("INV-2", invoice.DocumentNumber);
        Assert.Equal(T1, invoice.UpdatedAt);
        Assert.Empty(invoice.DomainEvents);
    }

    [Fact]
    public void ChangeDocumentNumber_with_equivalent_normalized_value_is_noop()
    {
        var invoice = CreateDraft(documentNumber: "INV-1");
        invoice.ClearDomainEvents();

        invoice.ChangeDocumentNumber("  INV-1  ", T1);

        Assert.Equal("INV-1", invoice.DocumentNumber);
        Assert.Equal(T0, invoice.UpdatedAt);
        Assert.Empty(invoice.DomainEvents);
    }

    [Fact]
    public void ChangeCounterpartyReference_updates_value()
    {
        var invoice = CreateDraft();
        invoice.ClearDomainEvents();

        invoice.ChangeCounterpartyReference(new CounterpartyReference("partner-9"), T1);

        Assert.Equal("partner-9", invoice.CounterpartyReference.Value);
        Assert.Equal(T1, invoice.UpdatedAt);
    }

    [Fact]
    public void ChangeCurrency_updates_value_in_draft()
    {
        var invoice = CreateDraft();
        invoice.ClearDomainEvents();

        invoice.ChangeCurrency(new Currency("usd"), T1);

        Assert.Equal("USD", invoice.Currency.Code);
        Assert.Equal(T1, invoice.UpdatedAt);
    }

    [Fact]
    public void SetDueDate_sets_and_updates()
    {
        var invoice = CreateDraft();
        invoice.ClearDomainEvents();

        invoice.SetDueDate(DueNextDay, T1);
        Assert.Equal(DueNextDay, invoice.DueDate);
        Assert.Equal(T1, invoice.UpdatedAt);

        invoice.SetDueDate(DueSameDay, T2);
        Assert.Equal(DueSameDay, invoice.DueDate);
        Assert.Equal(T2, invoice.UpdatedAt);
    }

    [Fact]
    public void SetDueDate_with_same_value_is_noop()
    {
        var invoice = CreateDraft();
        invoice.SetDueDate(DueNextDay, T1);
        invoice.ClearDomainEvents();

        invoice.SetDueDate(DueNextDay, T2);

        Assert.Equal(DueNextDay, invoice.DueDate);
        Assert.Equal(T1, invoice.UpdatedAt);
    }

    [Fact]
    public void AddLine_appends_line_with_computed_amount_and_sequence()
    {
        var invoice = CreateDraft();
        invoice.ClearDomainEvents();

        var line = invoice.AddLine(2m, 10.5m, description: "  Item  ", occurredAt: T1);

        Assert.Equal(2m, line.Quantity);
        Assert.Equal(10.5m, line.UnitPrice);
        Assert.Equal(21m, line.LineAmount);
        Assert.Equal("Item", line.Description);
        Assert.Equal(1, line.Sequence);
        Assert.Equal(line, Assert.Single(invoice.Lines));
        Assert.Equal(21m, invoice.TotalAmount);
        Assert.Equal(T1, invoice.UpdatedAt);
        Assert.Empty(invoice.DomainEvents);
    }

    [Fact]
    public void AddLine_sums_multiple_lines_exactly_and_assigns_unique_ids()
    {
        var invoice = CreateDraft();
        invoice.ClearDomainEvents();

        var first = invoice.AddLine(1m, 10.1m, description: null, occurredAt: T1);
        var second = invoice.AddLine(2m, 0.05m, description: null, occurredAt: T1);
        var third = invoice.AddLine(3m, 1m, description: null, occurredAt: T1);

        Assert.Equal(1, first.Sequence);
        Assert.Equal(2, second.Sequence);
        Assert.Equal(3, third.Sequence);
        Assert.NotEqual(first.Id, second.Id);
        Assert.NotEqual(second.Id, third.Id);
        Assert.Equal(13.2m, invoice.TotalAmount);
        Assert.Equal(3, invoice.Lines.Count);
    }

    [Fact]
    public void AddLine_rejects_zero_quantity()
    {
        var invoice = CreateDraft();
        Assert.Throws<ArgumentException>(() =>
            invoice.AddLine(0m, 10m, description: null, occurredAt: T1));
    }

    [Fact]
    public void AddLine_rejects_negative_quantity()
    {
        var invoice = CreateDraft();
        Assert.Throws<ArgumentException>(() =>
            invoice.AddLine(-1m, 10m, description: null, occurredAt: T1));
    }

    [Fact]
    public void AddLine_rejects_negative_unit_price()
    {
        var invoice = CreateDraft();
        Assert.Throws<ArgumentException>(() =>
            invoice.AddLine(1m, -0.01m, description: null, occurredAt: T1));
    }

    [Fact]
    public void AddLine_rejects_zero_line_amount()
    {
        var invoice = CreateDraft();
        Assert.Throws<ArgumentException>(() =>
            invoice.AddLine(1m, 0m, description: null, occurredAt: T1));
    }

    [Fact]
    public void UpdateLine_replaces_amounts_and_recalculates_total()
    {
        var invoice = CreateDraft();
        var line = invoice.AddLine(1m, 10m, description: "Old", occurredAt: T1);
        invoice.ClearDomainEvents();

        invoice.UpdateLine(line.Id, 3m, 4m, description: "  New  ", occurredAt: T2);

        Assert.Equal(3m, line.Quantity);
        Assert.Equal(4m, line.UnitPrice);
        Assert.Equal(12m, line.LineAmount);
        Assert.Equal("New", line.Description);
        Assert.Equal(12m, invoice.TotalAmount);
        Assert.Equal(T2, invoice.UpdatedAt);
    }

    [Fact]
    public void UpdateLine_missing_line_is_rejected()
    {
        var invoice = CreateDraft();
        invoice.AddLine(1m, 10m, description: null, occurredAt: T1);

        Assert.Throws<InvalidOperationException>(() =>
            invoice.UpdateLine(InvoiceLineId.New(), 1m, 5m, description: null, occurredAt: T2));
    }

    [Fact]
    public void RemoveLine_removes_existing_line_and_updates_total()
    {
        var invoice = CreateDraft();
        var keep = invoice.AddLine(1m, 10m, description: null, occurredAt: T1);
        var drop = invoice.AddLine(1m, 5m, description: null, occurredAt: T1);
        invoice.ClearDomainEvents();

        invoice.RemoveLine(drop.Id, T2);

        Assert.Equal(keep, Assert.Single(invoice.Lines));
        Assert.Equal(10m, invoice.TotalAmount);
        Assert.Equal(T2, invoice.UpdatedAt);
    }

    [Fact]
    public void RemoveLine_missing_line_is_rejected()
    {
        var invoice = CreateDraft();
        invoice.AddLine(1m, 10m, description: null, occurredAt: T1);

        Assert.Throws<InvalidOperationException>(() =>
            invoice.RemoveLine(InvoiceLineId.New(), T2));
    }

    [Fact]
    public void Mutation_rejects_timestamp_before_created_at()
    {
        var invoice = CreateDraft();
        var earlier = T0.AddMinutes(-1);

        Assert.Throws<ArgumentException>(() =>
            invoice.ChangeDocumentNumber("INV-9", earlier));
    }

    [Fact]
    public void Mutation_rejects_timestamp_before_updated_at()
    {
        var invoice = CreateDraft();
        invoice.ChangeDocumentNumber("INV-2", T1);

        Assert.Throws<ArgumentException>(() =>
            invoice.ChangeDocumentNumber("INV-3", T0));
    }

    [Fact]
    public void Issue_succeeds_for_valid_draft()
    {
        var invoice = CreateIssuableDraft();

        invoice.Issue(T2);

        Assert.Equal(InvoiceStatus.Issued, invoice.Status);
        Assert.Equal(T2, invoice.IssuedAt);
        Assert.Equal(T2, invoice.UpdatedAt);

        var issued = Assert.IsType<InvoiceIssued>(Assert.Single(invoice.DomainEvents));
        Assert.Equal(invoice.Id, issued.InvoiceId);
        Assert.Equal(WorkspaceId, issued.FinanceWorkspaceId);
        Assert.Equal(T2, issued.OccurredAt);
    }

    [Fact]
    public void Issue_allows_due_date_on_same_utc_calendar_day()
    {
        var invoice = CreateDraft(documentNumber: "INV-1");
        invoice.AddLine(1m, 10m, description: null, occurredAt: T1);
        invoice.SetDueDate(DueSameDay, T1);

        invoice.Issue(T2);

        Assert.Equal(InvoiceStatus.Issued, invoice.Status);
    }

    [Fact]
    public void Issue_rejects_empty_lines()
    {
        var invoice = CreateDraft();
        invoice.SetDueDate(DueNextDay, T1);

        Assert.Throws<InvalidOperationException>(() => invoice.Issue(T2));
    }

    [Fact]
    public void Issue_rejects_missing_due_date()
    {
        var invoice = CreateDraft();
        invoice.AddLine(1m, 10m, description: null, occurredAt: T1);

        Assert.Throws<InvalidOperationException>(() => invoice.Issue(T2));
    }

    [Fact]
    public void Issue_rejects_due_date_before_issue_calendar_day()
    {
        var invoice = CreateDraft();
        invoice.AddLine(1m, 10m, description: null, occurredAt: T1);
        invoice.SetDueDate(DueBeforeIssue, T1);

        Assert.Throws<InvalidOperationException>(() => invoice.Issue(T2));
    }

    [Fact]
    public void Issue_rejects_non_monotonic_timestamp()
    {
        var invoice = CreateIssuableDraft();

        Assert.Throws<ArgumentException>(() => invoice.Issue(T0));
    }

    [Fact]
    public void Issue_rejects_repeated_issue()
    {
        var invoice = CreateIssuableDraft();
        invoice.Issue(T2);

        Assert.Throws<InvalidOperationException>(() => invoice.Issue(T2));
    }

    [Fact]
    public void Issued_invoice_rejects_all_content_mutations()
    {
        var invoice = CreateIssuableDraft();
        var lineId = invoice.Lines[0].Id;
        invoice.Issue(T2);
        var later = T2.AddHours(1);

        Assert.Throws<InvalidOperationException>(() =>
            invoice.ChangeDocumentNumber("INV-X", later));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.ChangeCounterpartyReference(new CounterpartyReference("other"), later));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.ChangeCurrency(new Currency("USD"), later));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.SetDueDate(DueNextDay.AddDays(1), later));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.AddLine(1m, 1m, description: null, occurredAt: later));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.UpdateLine(lineId, 1m, 1m, description: null, occurredAt: later));
        Assert.Throws<InvalidOperationException>(() =>
            invoice.RemoveLine(lineId, later));
    }
}
