using System.Collections;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.JournalEntries;

public sealed class JournalEntryTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 8, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 9, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly FinanceWorkspaceId WorkspaceId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    private static readonly AccountId CashAccountId =
        new(Guid.Parse("22222222-2222-2222-2222-222222222222"));

    private static readonly AccountId RevenueAccountId =
        new(Guid.Parse("33333333-3333-3333-3333-333333333333"));

    private static readonly AccountId ExpenseAccountId =
        new(Guid.Parse("44444444-4444-4444-4444-444444444444"));

    private static JournalEntry CreateDraft(string name = " Opening entry ") =>
        JournalEntry.Create(JournalEntryId.New(), WorkspaceId, name, T0);

    private static JournalEntry CreateBalancedDraft()
    {
        var entry = CreateDraft(name: "Balanced entry");
        entry.ClearDomainEvents();
        entry.AddLine(CashAccountId, debit: 100m, credit: 0m, description: "Cash", occurredAt: T1);
        entry.AddLine(RevenueAccountId, debit: 0m, credit: 100m, description: "Revenue", occurredAt: T1);
        return entry;
    }

    [Fact]
    public void Create_produces_draft_with_normalized_state_and_event()
    {
        var id = JournalEntryId.New();

        var entry = JournalEntry.Create(id, WorkspaceId, "  Month close  ", T0);

        Assert.Equal(id, entry.Id);
        Assert.Equal(WorkspaceId, entry.FinanceWorkspaceId);
        Assert.Equal("Month close", entry.Name);
        Assert.Equal(JournalEntryStatus.Draft, entry.Status);
        Assert.Equal(T0, entry.CreatedAt);
        Assert.Equal(T0, entry.UpdatedAt);
        Assert.Null(entry.PostedAt);
        Assert.Empty(entry.Lines);
        Assert.True(entry.IsBalanced);
        Assert.Equal(0m, entry.TotalDebit);
        Assert.Equal(0m, entry.TotalCredit);

        var created = Assert.IsType<JournalEntryCreated>(Assert.Single(entry.DomainEvents));
        Assert.Equal(id, created.JournalEntryId);
        Assert.Equal(WorkspaceId, created.FinanceWorkspaceId);
        Assert.Equal("Month close", created.Name);
        Assert.Equal(T0, created.OccurredAt);
    }

    [Fact]
    public void Create_rejects_default_journal_entry_id()
    {
        Assert.Throws<ArgumentException>(() =>
            JournalEntry.Create(default, WorkspaceId, "Entry", T0));
    }

    [Fact]
    public void Create_rejects_default_finance_workspace_id()
    {
        Assert.Throws<ArgumentException>(() =>
            JournalEntry.Create(JournalEntryId.New(), default, "Entry", T0));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_name(string? name)
    {
        Assert.Throws<ArgumentException>(() => CreateDraft(name: name!));
    }

    [Fact]
    public void Create_rejects_overlength_name()
    {
        var name = new string('A', JournalEntry.NameMaxLength + 1);
        Assert.Throws<ArgumentException>(() => CreateDraft(name: name));
    }

    [Fact]
    public void Rename_updates_name_and_timestamp()
    {
        var entry = CreateDraft();
        entry.ClearDomainEvents();

        entry.Rename("Renamed entry", T1);

        Assert.Equal("Renamed entry", entry.Name);
        Assert.Equal(T1, entry.UpdatedAt);
        Assert.Empty(entry.DomainEvents);
    }

    [Fact]
    public void Rename_with_equivalent_normalized_name_is_noop()
    {
        var entry = CreateDraft(name: "Opening entry");
        entry.ClearDomainEvents();

        entry.Rename("  Opening entry  ", T1);

        Assert.Equal("Opening entry", entry.Name);
        Assert.Equal(T0, entry.UpdatedAt);
        Assert.Empty(entry.DomainEvents);
    }

    [Fact]
    public void AddLine_appends_debit_line_with_sequence()
    {
        var entry = CreateDraft();
        entry.ClearDomainEvents();

        var line = entry.AddLine(
            CashAccountId,
            debit: 50m,
            credit: 0m,
            description: "  Cash in  ",
            occurredAt: T1);

        Assert.Equal(CashAccountId, line.FinancialAccountId);
        Assert.Equal(50m, line.Debit);
        Assert.Equal(0m, line.Credit);
        Assert.Equal("Cash in", line.Description);
        Assert.Equal(1, line.Sequence);
        Assert.Equal(line, Assert.Single(entry.Lines));
        Assert.Equal(50m, entry.TotalDebit);
        Assert.Equal(0m, entry.TotalCredit);
        Assert.False(entry.IsBalanced);
        Assert.Equal(T1, entry.UpdatedAt);
    }

    [Fact]
    public void AddLine_appends_credit_line()
    {
        var entry = CreateDraft();

        var line = entry.AddLine(
            RevenueAccountId,
            debit: 0m,
            credit: 25.5m,
            description: null,
            occurredAt: T1);

        Assert.Equal(0m, line.Debit);
        Assert.Equal(25.5m, line.Credit);
        Assert.Null(line.Description);
    }

    [Fact]
    public void AddLine_assigns_increasing_sequences_for_multiple_lines()
    {
        var entry = CreateDraft();

        var first = entry.AddLine(CashAccountId, 100m, 0m, "A", T1);
        var second = entry.AddLine(RevenueAccountId, 0m, 40m, "B", T1);
        var third = entry.AddLine(ExpenseAccountId, 60m, 0m, "C", T1);

        Assert.Equal(1, first.Sequence);
        Assert.Equal(2, second.Sequence);
        Assert.Equal(3, third.Sequence);
        Assert.Equal(3, entry.Lines.Count);
        Assert.Equal(160m, entry.TotalDebit);
        Assert.Equal(40m, entry.TotalCredit);
        Assert.False(entry.IsBalanced);
    }

    [Fact]
    public void Draft_may_be_unbalanced()
    {
        var entry = CreateDraft();
        entry.AddLine(CashAccountId, 100m, 0m, null, T1);

        Assert.Equal(JournalEntryStatus.Draft, entry.Status);
        Assert.False(entry.IsBalanced);
    }

    [Fact]
    public void UpdateLine_replaces_amounts_account_and_description()
    {
        var entry = CreateDraft();
        var line = entry.AddLine(CashAccountId, 10m, 0m, "Old", T1);

        entry.UpdateLine(
            line.Id,
            RevenueAccountId,
            debit: 0m,
            credit: 20m,
            description: "  New  ",
            occurredAt: T2);

        Assert.Equal(RevenueAccountId, line.FinancialAccountId);
        Assert.Equal(0m, line.Debit);
        Assert.Equal(20m, line.Credit);
        Assert.Equal("New", line.Description);
        Assert.Equal(1, line.Sequence);
        Assert.Equal(T2, entry.UpdatedAt);
    }

    [Fact]
    public void UpdateLine_rejects_unknown_line()
    {
        var entry = CreateDraft();
        entry.AddLine(CashAccountId, 10m, 0m, null, T1);

        Assert.Throws<InvalidOperationException>(() =>
            entry.UpdateLine(JournalEntryLineId.New(), CashAccountId, 5m, 0m, null, T2));
    }

    [Fact]
    public void RemoveLine_removes_existing_line()
    {
        var entry = CreateDraft();
        var keep = entry.AddLine(CashAccountId, 10m, 0m, "Keep", T1);
        var remove = entry.AddLine(RevenueAccountId, 0m, 10m, "Remove", T1);

        entry.RemoveLine(remove.Id, T2);

        Assert.Equal(keep, Assert.Single(entry.Lines));
        Assert.Equal(T2, entry.UpdatedAt);
    }

    [Fact]
    public void RemoveLine_rejects_unknown_line()
    {
        var entry = CreateDraft();
        entry.AddLine(CashAccountId, 10m, 0m, null, T1);

        Assert.Throws<InvalidOperationException>(() =>
            entry.RemoveLine(JournalEntryLineId.New(), T2));
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(-0.01, 0)]
    public void AddLine_rejects_negative_debit(decimal debit, decimal credit)
    {
        var entry = CreateDraft();

        var ex = Assert.Throws<ArgumentException>(() =>
            entry.AddLine(CashAccountId, debit, credit, null, T1));

        Assert.Equal("debit", ex.ParamName);
        Assert.Empty(entry.Lines);
    }

    [Theory]
    [InlineData(0, -1)]
    [InlineData(0, -0.01)]
    public void AddLine_rejects_negative_credit(decimal debit, decimal credit)
    {
        var entry = CreateDraft();

        var ex = Assert.Throws<ArgumentException>(() =>
            entry.AddLine(CashAccountId, debit, credit, null, T1));

        Assert.Equal("credit", ex.ParamName);
        Assert.Empty(entry.Lines);
    }

    [Fact]
    public void AddLine_rejects_both_zero()
    {
        var entry = CreateDraft();

        Assert.Throws<ArgumentException>(() =>
            entry.AddLine(CashAccountId, 0m, 0m, null, T1));

        Assert.Empty(entry.Lines);
    }

    [Fact]
    public void AddLine_rejects_both_positive()
    {
        var entry = CreateDraft();

        Assert.Throws<ArgumentException>(() =>
            entry.AddLine(CashAccountId, 10m, 5m, null, T1));

        Assert.Empty(entry.Lines);
    }

    [Fact]
    public void UpdateLine_rejects_invalid_amounts()
    {
        var entry = CreateDraft();
        var line = entry.AddLine(CashAccountId, 10m, 0m, null, T1);

        Assert.Throws<ArgumentException>(() =>
            entry.UpdateLine(line.Id, CashAccountId, 0m, 0m, null, T2));
        Assert.Throws<ArgumentException>(() =>
            entry.UpdateLine(line.Id, CashAccountId, 1m, 1m, null, T2));
        Assert.Throws<ArgumentException>(() =>
            entry.UpdateLine(line.Id, CashAccountId, -1m, 0m, null, T2));
        Assert.Throws<ArgumentException>(() =>
            entry.UpdateLine(line.Id, CashAccountId, 0m, -1m, null, T2));

        Assert.Equal(10m, line.Debit);
        Assert.Equal(0m, line.Credit);
    }

    [Fact]
    public void AddLine_rejects_default_financial_account_id()
    {
        var entry = CreateDraft();

        Assert.Throws<ArgumentException>(() =>
            entry.AddLine(default, 10m, 0m, null, T1));
    }

    [Fact]
    public void Post_balanced_journal_transitions_to_posted_with_event()
    {
        var entry = CreateBalancedDraft();

        entry.Post(T2);

        Assert.Equal(JournalEntryStatus.Posted, entry.Status);
        Assert.Equal(T2, entry.PostedAt);
        Assert.Equal(T2, entry.UpdatedAt);
        Assert.True(entry.IsBalanced);

        var posted = Assert.IsType<JournalEntryPosted>(Assert.Single(entry.DomainEvents));
        Assert.Equal(entry.Id, posted.JournalEntryId);
        Assert.Equal(WorkspaceId, posted.FinanceWorkspaceId);
        Assert.Equal(T2, posted.OccurredAt);
    }

    [Fact]
    public void Post_rejects_unbalanced_journal()
    {
        var entry = CreateDraft();
        entry.ClearDomainEvents();
        entry.AddLine(CashAccountId, 100m, 0m, null, T1);

        Assert.Throws<InvalidOperationException>(() => entry.Post(T2));

        Assert.Equal(JournalEntryStatus.Draft, entry.Status);
        Assert.Null(entry.PostedAt);
        Assert.Empty(entry.DomainEvents);
    }

    [Fact]
    public void Post_rejects_empty_journal()
    {
        var entry = CreateDraft();
        entry.ClearDomainEvents();

        Assert.Throws<InvalidOperationException>(() => entry.Post(T1));

        Assert.Equal(JournalEntryStatus.Draft, entry.Status);
        Assert.Null(entry.PostedAt);
        Assert.Empty(entry.DomainEvents);
    }

    [Fact]
    public void Rename_rejects_after_post()
    {
        var entry = CreateBalancedDraft();
        entry.Post(T2);

        Assert.Throws<InvalidOperationException>(() => entry.Rename("Nope", T2));
        Assert.Equal("Balanced entry", entry.Name);
    }

    [Fact]
    public void AddLine_rejects_after_post()
    {
        var entry = CreateBalancedDraft();
        entry.Post(T2);
        var count = entry.Lines.Count;

        Assert.Throws<InvalidOperationException>(() =>
            entry.AddLine(ExpenseAccountId, 1m, 0m, null, T2));

        Assert.Equal(count, entry.Lines.Count);
    }

    [Fact]
    public void UpdateLine_rejects_after_post()
    {
        var entry = CreateBalancedDraft();
        var lineId = entry.Lines[0].Id;
        entry.Post(T2);

        Assert.Throws<InvalidOperationException>(() =>
            entry.UpdateLine(lineId, CashAccountId, 50m, 0m, null, T2));

        Assert.Equal(100m, entry.Lines[0].Debit);
    }

    [Fact]
    public void RemoveLine_rejects_after_post()
    {
        var entry = CreateBalancedDraft();
        var lineId = entry.Lines[0].Id;
        entry.Post(T2);

        Assert.Throws<InvalidOperationException>(() => entry.RemoveLine(lineId, T2));
        Assert.Equal(2, entry.Lines.Count);
    }

    [Fact]
    public void Post_rejects_when_already_posted()
    {
        var entry = CreateBalancedDraft();
        entry.Post(T2);

        Assert.Throws<InvalidOperationException>(() => entry.Post(T2));
        Assert.Single(entry.DomainEvents);
        Assert.IsType<JournalEntryPosted>(entry.DomainEvents[0]);
    }

    [Fact]
    public void DomainEvents_view_cannot_be_mutated_externally()
    {
        var entry = CreateDraft();
        var view = entry.DomainEvents;

        Assert.IsAssignableFrom<IReadOnlyList<IDomainEvent>>(view);
        Assert.False(view is List<IDomainEvent>);

        var mutable = Assert.IsAssignableFrom<IList>(view);
        Assert.Throws<NotSupportedException>(() =>
            mutable.Add(new JournalEntryPosted(entry.Id, WorkspaceId, T1)));
        Assert.Throws<NotSupportedException>(mutable.Clear);

        Assert.Single(entry.DomainEvents);
        Assert.IsType<JournalEntryCreated>(entry.DomainEvents[0]);
    }

    [Fact]
    public void Lines_view_cannot_be_mutated_externally()
    {
        var entry = CreateDraft();
        entry.AddLine(CashAccountId, 10m, 0m, null, T1);
        var view = entry.Lines;

        Assert.IsAssignableFrom<IReadOnlyList<JournalEntryLine>>(view);
        var mutable = Assert.IsAssignableFrom<IList>(view);
        Assert.Throws<NotSupportedException>(mutable.Clear);
        Assert.Single(entry.Lines);
    }

    [Fact]
    public void ClearDomainEvents_removes_raised_events()
    {
        var entry = CreateDraft();
        Assert.NotEmpty(entry.DomainEvents);

        entry.ClearDomainEvents();

        Assert.Empty(entry.DomainEvents);
    }

    [Fact]
    public void Mutation_rejects_timestamp_earlier_than_created_at()
    {
        var entry = CreateDraft();
        var earlier = T0.AddMinutes(-1);

        Assert.Throws<ArgumentException>(() => entry.Rename("Later", earlier));
    }

    [Fact]
    public void Mutation_rejects_timestamp_earlier_than_updated_at()
    {
        var entry = CreateDraft();
        entry.Rename("First", T1);

        Assert.Throws<ArgumentException>(() => entry.Rename("Second", T0));
    }

    [Fact]
    public void AddLine_rejects_overlength_description()
    {
        var entry = CreateDraft();
        var description = new string('A', JournalEntryLine.DescriptionMaxLength + 1);

        Assert.Throws<ArgumentException>(() =>
            entry.AddLine(CashAccountId, 1m, 0m, description, T1));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void AddLine_normalizes_blank_description_to_null(string description)
    {
        var entry = CreateDraft();

        var line = entry.AddLine(CashAccountId, 1m, 0m, description, T1);

        Assert.Null(line.Description);
    }
}
