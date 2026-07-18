using System.Collections;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Accounts;

public sealed class AccountTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 18, 8, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 18, 9, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 18, 10, 0, 0, TimeSpan.Zero);

    private static readonly FinanceWorkspaceId WorkspaceId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    private static Account CreateActive(
        string code = "1000",
        string name = " Cash ",
        AccountType type = AccountType.Asset) =>
        Account.Create(AccountId.New(), WorkspaceId, code, name, type, T0);

    [Fact]
    public void Create_produces_active_account_with_normalized_state_and_event()
    {
        var id = AccountId.New();

        var account = Account.Create(
            id,
            WorkspaceId,
            "  1000  ",
            "  Operating Cash  ",
            AccountType.Asset,
            T0);

        Assert.Equal(id, account.Id);
        Assert.Equal(WorkspaceId, account.FinanceWorkspaceId);
        Assert.Equal(new AccountCode("1000"), account.Code);
        Assert.Equal("Operating Cash", account.Name);
        Assert.Equal(AccountType.Asset, account.Type);
        Assert.Equal(AccountStatus.Active, account.Status);
        Assert.Equal(T0, account.CreatedAt);
        Assert.Equal(T0, account.UpdatedAt);
        Assert.Null(account.ArchivedAt);

        var created = Assert.IsType<AccountCreated>(Assert.Single(account.DomainEvents));
        Assert.Equal(id, created.AccountId);
        Assert.Equal(WorkspaceId, created.FinanceWorkspaceId);
        Assert.Equal("1000", created.Code);
        Assert.Equal("Operating Cash", created.Name);
        Assert.Equal(AccountType.Asset, created.Type);
        Assert.Equal(T0, created.OccurredAt);
    }

    [Theory]
    [InlineData(AccountType.Asset)]
    [InlineData(AccountType.Liability)]
    [InlineData(AccountType.Equity)]
    [InlineData(AccountType.Revenue)]
    [InlineData(AccountType.Expense)]
    public void Create_accepts_each_defined_account_type(AccountType type)
    {
        var account = CreateActive(type: type);
        Assert.Equal(type, account.Type);
    }

    [Fact]
    public void Create_rejects_undefined_account_type()
    {
        var undefined = (AccountType)999;

        Assert.Throws<ArgumentException>(() =>
            Account.Create(AccountId.New(), WorkspaceId, "1000", "Cash", undefined, T0));
    }

    [Fact]
    public void Create_rejects_default_account_id()
    {
        Assert.Throws<ArgumentException>(() =>
            Account.Create(default, WorkspaceId, "1000", "Cash", AccountType.Asset, T0));
    }

    [Fact]
    public void Create_rejects_default_finance_workspace_id()
    {
        Assert.Throws<ArgumentException>(() =>
            Account.Create(AccountId.New(), default, "1000", "Cash", AccountType.Asset, T0));
    }

    [Fact]
    public void Create_accepts_unicode_name()
    {
        var account = CreateActive(name: "  Каса основна  ");
        Assert.Equal("Каса основна", account.Name);
    }

    [Fact]
    public void DomainEvents_view_cannot_be_mutated_externally()
    {
        var account = CreateActive();
        var view = account.DomainEvents;

        Assert.IsAssignableFrom<IReadOnlyList<IDomainEvent>>(view);
        Assert.False(view is List<IDomainEvent>);

        var mutable = Assert.IsAssignableFrom<IList>(view);
        Assert.Throws<NotSupportedException>(() =>
            mutable.Add(new AccountArchived(account.Id, T1)));
        Assert.Throws<NotSupportedException>(mutable.Clear);

        Assert.Single(account.DomainEvents);
        Assert.IsType<AccountCreated>(account.DomainEvents[0]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_name(string? name)
    {
        Assert.Throws<ArgumentException>(() => CreateActive(name: name!));
    }

    [Fact]
    public void Create_rejects_overlength_name()
    {
        var name = new string('A', Account.NameMaxLength + 1);
        Assert.Throws<ArgumentException>(() => CreateActive(name: name));
    }

    [Fact]
    public void Create_accepts_max_length_name()
    {
        var name = new string('A', Account.NameMaxLength);
        var account = CreateActive(name: name);
        Assert.Equal(name, account.Name);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_code(string? code)
    {
        Assert.Throws<ArgumentException>(() => CreateActive(code: code!));
    }

    [Fact]
    public void Rename_updates_name_timestamp_and_raises_event()
    {
        var account = CreateActive();
        account.ClearDomainEvents();

        account.Rename("Petty Cash", T1);

        Assert.Equal("Petty Cash", account.Name);
        Assert.Equal(T1, account.UpdatedAt);

        var renamed = Assert.IsType<AccountRenamed>(Assert.Single(account.DomainEvents));
        Assert.Equal(account.Id, renamed.AccountId);
        Assert.Equal("Petty Cash", renamed.Name);
        Assert.Equal(T1, renamed.OccurredAt);
    }

    [Fact]
    public void Rename_with_equivalent_normalized_name_is_noop()
    {
        var account = CreateActive(name: "Cash");
        account.ClearDomainEvents();

        account.Rename("  Cash  ", T1);

        Assert.Equal("Cash", account.Name);
        Assert.Equal(T0, account.UpdatedAt);
        Assert.Empty(account.DomainEvents);
    }

    [Fact]
    public void Rename_rejects_archived_account()
    {
        var account = CreateActive();
        account.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => account.Rename("Nope", T2));
        Assert.Equal("Cash", account.Name);
        Assert.Equal(T1, account.UpdatedAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Rename_rejects_blank_name(string? name)
    {
        var account = CreateActive();
        Assert.Throws<ArgumentException>(() => account.Rename(name!, T1));
    }

    [Fact]
    public void ChangeCode_updates_code_timestamp_and_raises_event()
    {
        var account = CreateActive();
        account.ClearDomainEvents();

        account.ChangeCode("1100", T1);

        Assert.Equal(new AccountCode("1100"), account.Code);
        Assert.Equal(T1, account.UpdatedAt);

        var changed = Assert.IsType<AccountCodeChanged>(Assert.Single(account.DomainEvents));
        Assert.Equal(account.Id, changed.AccountId);
        Assert.Equal("1100", changed.Code);
        Assert.Equal(T1, changed.OccurredAt);
    }

    [Fact]
    public void ChangeCode_with_case_equivalent_code_is_noop()
    {
        var account = CreateActive(code: "Cash");
        account.ClearDomainEvents();

        account.ChangeCode("cash", T1);

        Assert.Equal("Cash", account.Code.Value);
        Assert.Equal(T0, account.UpdatedAt);
        Assert.Empty(account.DomainEvents);
    }

    [Fact]
    public void ChangeCode_rejects_archived_account()
    {
        var account = CreateActive();
        account.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => account.ChangeCode("1100", T2));
        Assert.Equal(new AccountCode("1000"), account.Code);
    }

    [Fact]
    public void ChangeType_updates_type_timestamp_and_raises_event()
    {
        var account = CreateActive(type: AccountType.Asset);
        account.ClearDomainEvents();

        account.ChangeType(AccountType.Expense, T1);

        Assert.Equal(AccountType.Expense, account.Type);
        Assert.Equal(T1, account.UpdatedAt);

        var changed = Assert.IsType<AccountTypeChanged>(Assert.Single(account.DomainEvents));
        Assert.Equal(AccountType.Expense, changed.Type);
        Assert.Equal(T1, changed.OccurredAt);
    }

    [Fact]
    public void ChangeType_with_same_type_is_noop()
    {
        var account = CreateActive(type: AccountType.Asset);
        account.ClearDomainEvents();

        account.ChangeType(AccountType.Asset, T1);

        Assert.Equal(AccountType.Asset, account.Type);
        Assert.Equal(T0, account.UpdatedAt);
        Assert.Empty(account.DomainEvents);
    }

    [Fact]
    public void ChangeType_rejects_undefined_type()
    {
        var account = CreateActive();
        Assert.Throws<ArgumentException>(() => account.ChangeType((AccountType)999, T1));
    }

    [Fact]
    public void ChangeType_rejects_archived_account()
    {
        var account = CreateActive();
        account.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => account.ChangeType(AccountType.Liability, T2));
        Assert.Equal(AccountType.Asset, account.Type);
    }

    [Fact]
    public void Archive_transitions_active_to_archived_with_event()
    {
        var account = CreateActive();
        account.ClearDomainEvents();

        account.Archive(T1);

        Assert.Equal(AccountStatus.Archived, account.Status);
        Assert.Equal(T1, account.ArchivedAt);
        Assert.Equal(T1, account.UpdatedAt);

        var archived = Assert.IsType<AccountArchived>(Assert.Single(account.DomainEvents));
        Assert.Equal(account.Id, archived.AccountId);
        Assert.Equal(T1, archived.OccurredAt);
    }

    [Fact]
    public void Archive_rejects_when_already_archived()
    {
        var account = CreateActive();
        account.ClearDomainEvents();
        account.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => account.Archive(T2));
        Assert.Equal(T1, account.ArchivedAt);
        Assert.Equal(T1, account.UpdatedAt);
        Assert.Single(account.DomainEvents);
        Assert.IsType<AccountArchived>(account.DomainEvents[0]);
    }

    [Fact]
    public void Rejected_mutation_leaves_state_and_events_unchanged()
    {
        var account = CreateActive(name: "Cash");
        account.ClearDomainEvents();

        Assert.Throws<ArgumentException>(() => account.Rename("   ", T1));

        Assert.Equal("Cash", account.Name);
        Assert.Equal(T0, account.UpdatedAt);
        Assert.Empty(account.DomainEvents);
    }

    [Fact]
    public void Mutation_allows_timestamp_equal_to_updated_at()
    {
        var account = CreateActive(name: "Cash");
        account.ClearDomainEvents();

        account.Rename("Renamed At Same Instant", T0);

        Assert.Equal("Renamed At Same Instant", account.Name);
        Assert.Equal(T0, account.UpdatedAt);
        Assert.Single(account.DomainEvents);
    }

    [Fact]
    public void Archived_account_is_immutable()
    {
        var account = CreateActive();
        account.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => account.Rename("X", T2));
        Assert.Throws<InvalidOperationException>(() => account.ChangeCode("1100", T2));
        Assert.Throws<InvalidOperationException>(() => account.ChangeType(AccountType.Equity, T2));
        Assert.Throws<InvalidOperationException>(() => account.Archive(T2));
    }

    [Fact]
    public void Mutation_rejects_timestamp_earlier_than_created_at()
    {
        var account = CreateActive();
        var earlier = T0.AddMinutes(-1);

        Assert.Throws<ArgumentException>(() => account.Rename("Later Name", earlier));
    }

    [Fact]
    public void Mutation_rejects_timestamp_earlier_than_updated_at()
    {
        var account = CreateActive();
        account.Rename("First", T1);

        Assert.Throws<ArgumentException>(() => account.Rename("Second", T0));
    }

    [Fact]
    public void ClearDomainEvents_removes_raised_events()
    {
        var account = CreateActive();
        Assert.NotEmpty(account.DomainEvents);

        account.ClearDomainEvents();

        Assert.Empty(account.DomainEvents);
    }

    [Fact]
    public void NameMaxLength_is_exposed()
    {
        Assert.Equal(200, Account.NameMaxLength);
    }
}
