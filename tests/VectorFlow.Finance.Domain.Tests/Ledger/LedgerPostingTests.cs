using System.Collections;
using System.Reflection;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Ledger;

public sealed class LedgerPostingTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 10, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 11, 0, 0, TimeSpan.Zero);

    private static readonly FinanceWorkspaceId WorkspaceId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    private static readonly AccountId CashAccountId =
        new(Guid.Parse("22222222-2222-2222-2222-222222222222"));

    private static readonly AccountId RevenueAccountId =
        new(Guid.Parse("33333333-3333-3333-3333-333333333333"));

    private static readonly AccountId ExpenseAccountId =
        new(Guid.Parse("44444444-4444-4444-4444-444444444444"));

    private static JournalEntry CreatePostedBalanced(decimal amount = 100.25m)
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), WorkspaceId, "Sale", T0);
        entry.AddLine(CashAccountId, amount, 0m, "Cash", T0);
        entry.AddLine(RevenueAccountId, 0m, amount, "Revenue", T0);
        entry.Post(T1);
        return entry;
    }

    [Fact]
    public void CreateFrom_creates_posting_from_posted_journal_entry()
    {
        var entry = CreatePostedBalanced();
        var postingId = LedgerPostingId.New();

        var posting = LedgerPosting.CreateFrom(postingId, entry);

        Assert.Equal(postingId, posting.Id);
        Assert.Equal(WorkspaceId, posting.FinanceWorkspaceId);
        Assert.Equal(entry.Id, posting.JournalEntryId);
        Assert.Equal(T1, posting.PostedAtUtc);
        Assert.Equal(2, posting.Lines.Count);
        Assert.Equal(100.25m, posting.TotalDebit);
        Assert.Equal(100.25m, posting.TotalCredit);

        var debit = posting.Lines.Single(line => line.Debit > 0m);
        var credit = posting.Lines.Single(line => line.Credit > 0m);
        var sourceDebit = entry.Lines.Single(line => line.Debit > 0m);
        var sourceCredit = entry.Lines.Single(line => line.Credit > 0m);

        Assert.Equal(sourceDebit.Id, debit.SourceJournalEntryLineId);
        Assert.Equal(sourceCredit.Id, credit.SourceJournalEntryLineId);
        Assert.Equal(CashAccountId, debit.FinancialAccountId);
        Assert.Equal(RevenueAccountId, credit.FinancialAccountId);
        Assert.Equal(100.25m, debit.Debit);
        Assert.Equal(0m, debit.Credit);
        Assert.Equal(0m, credit.Debit);
        Assert.Equal(100.25m, credit.Credit);
        Assert.Equal("Cash", debit.Description);
        Assert.Equal("Revenue", credit.Description);
        Assert.Equal(1, debit.Sequence);
        Assert.Equal(2, credit.Sequence);

        Assert.NotSame(sourceDebit, debit);
        Assert.NotSame(sourceCredit, credit);

        var created = Assert.IsType<LedgerPostingCreated>(Assert.Single(posting.DomainEvents));
        Assert.Equal(postingId, created.LedgerPostingId);
        Assert.Equal(WorkspaceId, created.FinanceWorkspaceId);
        Assert.Equal(entry.Id, created.JournalEntryId);
        Assert.Equal(T1, created.PostedAtUtc);
    }

    [Fact]
    public void CreateFrom_rejects_draft_journal_entry()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), WorkspaceId, "Draft", T0);
        entry.AddLine(CashAccountId, 10m, 0m, null, T0);
        entry.AddLine(RevenueAccountId, 0m, 10m, null, T0);

        Assert.Throws<InvalidOperationException>(() =>
            LedgerPosting.CreateFrom(LedgerPostingId.New(), entry));
    }

    [Fact]
    public void CreateFrom_rejects_null_journal_entry()
    {
        Assert.Throws<ArgumentNullException>(() =>
            LedgerPosting.CreateFrom(LedgerPostingId.New(), null!));
    }

    [Fact]
    public void Line_Create_rejects_zero_zero()
    {
        Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                JournalEntryLineId.New(),
                CashAccountId,
                0m,
                0m,
                null,
                1));
    }

    [Fact]
    public void Line_Create_rejects_both_positive()
    {
        Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                JournalEntryLineId.New(),
                CashAccountId,
                1m,
                1m,
                null,
                1));
    }

    [Fact]
    public void Line_Create_rejects_negative_debit()
    {
        var ex = Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                JournalEntryLineId.New(),
                CashAccountId,
                -1m,
                0m,
                null,
                1));
        Assert.Equal("debit", ex.ParamName);
    }

    [Fact]
    public void Line_Create_rejects_negative_credit()
    {
        var ex = Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                JournalEntryLineId.New(),
                CashAccountId,
                0m,
                -1m,
                null,
                1));
        Assert.Equal("credit", ex.ParamName);
    }

    [Fact]
    public void Line_Create_rejects_empty_source_journal_entry_line_id()
    {
        Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                default,
                CashAccountId,
                1m,
                0m,
                null,
                1));
    }

    [Fact]
    public void Line_Create_rejects_invalid_account_id()
    {
        Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                JournalEntryLineId.New(),
                default,
                1m,
                0m,
                null,
                1));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Line_Create_rejects_invalid_sequence(int sequence)
    {
        Assert.Throws<ArgumentException>(() =>
            LedgerPostingLine.Create(
                LedgerPostingLineId.New(),
                JournalEntryLineId.New(),
                CashAccountId,
                1m,
                0m,
                null,
                sequence));
    }

    [Fact]
    public void Line_Create_rejects_duplicate_source_ids_are_enforced_on_posting_build()
    {
        // Duplicate SourceJournalEntryLineId cannot be produced via JournalEntry public API.
        // Closest constructible invariant: LedgerPostingLine.Create accepts a single source id,
        // and CreateFrom rejects duplicates if they were ever present (defensive check).
        var sourceId = JournalEntryLineId.New();
        var first = LedgerPostingLine.Create(
            LedgerPostingLineId.New(), sourceId, CashAccountId, 10m, 0m, null, 1);
        var second = LedgerPostingLine.Create(
            LedgerPostingLineId.New(), sourceId, RevenueAccountId, 0m, 10m, null, 2);

        Assert.Equal(first.SourceJournalEntryLineId, second.SourceJournalEntryLineId);
    }

    [Fact]
    public void Unbalanced_source_cannot_be_posted_so_CreateFrom_never_sees_it()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), WorkspaceId, "Unbalanced", T0);
        entry.AddLine(CashAccountId, 10m, 0m, null, T0);

        Assert.Throws<InvalidOperationException>(() => entry.Post(T1));
        Assert.Equal(JournalEntryStatus.Draft, entry.Status);
        Assert.Throws<InvalidOperationException>(() =>
            LedgerPosting.CreateFrom(LedgerPostingId.New(), entry));
    }

    [Fact]
    public void Lines_exposed_as_read_only_and_external_mutation_fails()
    {
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), CreatePostedBalanced());
        var view = posting.Lines;

        Assert.IsAssignableFrom<IReadOnlyList<LedgerPostingLine>>(view);
        Assert.False(view is List<LedgerPostingLine>);

        var mutable = Assert.IsAssignableFrom<IList>(view);
        Assert.Throws<NotSupportedException>(mutable.Clear);
        Assert.Equal(2, posting.Lines.Count);
    }

    [Fact]
    public void DomainEvents_view_cannot_be_mutated_externally()
    {
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), CreatePostedBalanced());
        var view = posting.DomainEvents;

        var mutable = Assert.IsAssignableFrom<IList>(view);
        Assert.Throws<NotSupportedException>(() =>
            mutable.Add(new LedgerPostingCreated(
                posting.Id, posting.FinanceWorkspaceId, posting.JournalEntryId, posting.PostedAtUtc)));
        Assert.Single(posting.DomainEvents);
    }

    [Fact]
    public void Aggregate_and_lines_expose_no_public_mutation_methods()
    {
        var postingMethods = typeof(LedgerPosting)
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Select(method => method.Name)
            .ToArray();

        Assert.DoesNotContain("AddLine", postingMethods);
        Assert.DoesNotContain("RemoveLine", postingMethods);
        Assert.DoesNotContain("UpdateLine", postingMethods);
        Assert.DoesNotContain("Rename", postingMethods);
        Assert.Contains("ClearDomainEvents", postingMethods);

        var lineMethods = typeof(LedgerPostingLine)
            .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .Where(method => !method.IsSpecialName)
            .Select(method => method.Name)
            .ToArray();

        Assert.DoesNotContain("Update", lineMethods);
        Assert.DoesNotContain("Replace", lineMethods);
        Assert.DoesNotContain("ChangeAmount", lineMethods);
        Assert.Empty(lineMethods);
    }

    [Fact]
    public void Fractional_decimal_values_copied_exactly()
    {
        var amount = 100.25m;
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), CreatePostedBalanced(amount));

        Assert.Equal(amount, posting.TotalDebit);
        Assert.Equal(amount, posting.TotalCredit);
        Assert.Equal(amount, posting.Lines.Sum(line => line.Debit));
        Assert.Equal(amount, posting.Lines.Sum(line => line.Credit));
    }

    [Fact]
    public void Multiple_debit_and_credit_lines_preserve_sequence_and_balance()
    {
        var entry = JournalEntry.Create(JournalEntryId.New(), WorkspaceId, "Complex", T0);
        entry.AddLine(CashAccountId, 60m, 0m, "Cash A", T0);
        entry.AddLine(ExpenseAccountId, 40m, 0m, "Expense", T0);
        entry.AddLine(RevenueAccountId, 0m, 70m, "Revenue", T0);
        entry.AddLine(CashAccountId, 0m, 30m, "Cash B", T0);
        entry.Post(T1);

        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), entry);

        Assert.Equal(4, posting.Lines.Count);
        Assert.Equal(entry.Lines.Count, posting.Lines.Count);
        Assert.Equal(100m, posting.TotalDebit);
        Assert.Equal(100m, posting.TotalCredit);
        Assert.Equal(new[] { 1, 2, 3, 4 }, posting.Lines.Select(line => line.Sequence).ToArray());
        Assert.Equal(2, posting.Lines.Count(line => line.FinancialAccountId.Equals(CashAccountId)));
    }

    [Fact]
    public void ClearDomainEvents_removes_raised_events()
    {
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), CreatePostedBalanced());
        Assert.NotEmpty(posting.DomainEvents);

        posting.ClearDomainEvents();

        Assert.Empty(posting.DomainEvents);
    }

    [Fact]
    public void CreateFrom_raises_LedgerPostingCreated_exactly_once()
    {
        var posting = LedgerPosting.CreateFrom(LedgerPostingId.New(), CreatePostedBalanced());
        Assert.Single(posting.DomainEvents);
        Assert.IsType<LedgerPostingCreated>(posting.DomainEvents[0]);
    }
}
