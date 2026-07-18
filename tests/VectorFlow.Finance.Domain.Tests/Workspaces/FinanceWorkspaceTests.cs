using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Workspaces;

public sealed class FinanceWorkspaceTests
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 18, 8, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 18, 9, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 18, 10, 0, 0, TimeSpan.Zero);

    private static readonly PlatformOrganizationId OrganizationId =
        new(Guid.Parse("11111111-1111-1111-1111-111111111111"));

    private static readonly PlatformWorkspaceId PlatformWorkspaceId =
        new(Guid.Parse("22222222-2222-2222-2222-222222222222"));

    private static FinanceWorkspace CreateActive(string name = " Operating Finance ", string currency = "uah") =>
        FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            OrganizationId,
            PlatformWorkspaceId,
            name,
            currency,
            T0);

    [Fact]
    public void Create_produces_active_workspace_with_normalized_state()
    {
        var id = FinanceWorkspaceId.New();

        var workspace = FinanceWorkspace.Create(
            id,
            OrganizationId,
            PlatformWorkspaceId,
            "  Primary Finance  ",
            "uah",
            T0);

        Assert.Equal(id, workspace.Id);
        Assert.Equal(OrganizationId, workspace.PlatformOrganizationId);
        Assert.Equal(PlatformWorkspaceId, workspace.PlatformWorkspaceId);
        Assert.Equal("Primary Finance", workspace.Name);
        Assert.Equal(new Currency("UAH"), workspace.DefaultCurrency);
        Assert.Equal(FinanceWorkspaceStatus.Active, workspace.Status);
        Assert.Equal(T0, workspace.CreatedAt);
        Assert.Equal(T0, workspace.UpdatedAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_blank_name(string? name)
    {
        Assert.Throws<ArgumentException>(() => CreateActive(name!));
    }

    [Fact]
    public void Create_rejects_overlength_name()
    {
        var name = new string('A', FinanceWorkspace.NameMaxLength + 1);
        Assert.Throws<ArgumentException>(() => CreateActive(name));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_rejects_invalid_currency(string? currency)
    {
        Assert.Throws<ArgumentException>(() => CreateActive(currency: currency!));
    }

    [Fact]
    public void Rename_updates_active_workspace()
    {
        var workspace = CreateActive();
        workspace.Rename("Renamed Finance", T1);

        Assert.Equal("Renamed Finance", workspace.Name);
        Assert.Equal(T1, workspace.UpdatedAt);
    }

    [Fact]
    public void Rename_updates_suspended_workspace()
    {
        var workspace = CreateActive();
        workspace.Suspend(T1);

        workspace.Rename("Suspended Rename", T2);

        Assert.Equal("Suspended Rename", workspace.Name);
        Assert.Equal(T2, workspace.UpdatedAt);
    }

    [Fact]
    public void Rename_rejects_archived_workspace()
    {
        var workspace = CreateActive();
        workspace.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => workspace.Rename("Nope", T2));
        Assert.Equal(T1, workspace.UpdatedAt);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Rename_rejects_blank_name(string? name)
    {
        var workspace = CreateActive();
        Assert.Throws<ArgumentException>(() => workspace.Rename(name!, T1));
    }

    [Fact]
    public void Rename_rejects_overlength_name()
    {
        var workspace = CreateActive();
        var name = new string('B', FinanceWorkspace.NameMaxLength + 1);

        Assert.Throws<ArgumentException>(() => workspace.Rename(name, T1));
    }

    [Fact]
    public void Rename_with_equivalent_normalized_name_does_not_mutate()
    {
        var workspace = CreateActive("Primary Finance");
        workspace.Rename("  Primary Finance  ", T1);

        Assert.Equal("Primary Finance", workspace.Name);
        Assert.Equal(T0, workspace.UpdatedAt);
    }

    [Fact]
    public void ChangeDefaultCurrency_updates_active_workspace()
    {
        var workspace = CreateActive();
        workspace.ChangeDefaultCurrency("eur", T1);

        Assert.Equal(new Currency("EUR"), workspace.DefaultCurrency);
        Assert.Equal(T1, workspace.UpdatedAt);
    }

    [Fact]
    public void ChangeDefaultCurrency_rejects_suspended_workspace()
    {
        var workspace = CreateActive();
        workspace.Suspend(T1);

        Assert.Throws<InvalidOperationException>(() => workspace.ChangeDefaultCurrency("USD", T2));
        Assert.Equal(new Currency("UAH"), workspace.DefaultCurrency);
        Assert.Equal(T1, workspace.UpdatedAt);
    }

    [Fact]
    public void ChangeDefaultCurrency_rejects_archived_workspace()
    {
        var workspace = CreateActive();
        workspace.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => workspace.ChangeDefaultCurrency("USD", T2));
    }

    [Fact]
    public void ChangeDefaultCurrency_with_equivalent_currency_does_not_mutate()
    {
        var workspace = CreateActive(currency: "UAH");
        workspace.ChangeDefaultCurrency("uah", T1);

        Assert.Equal(new Currency("UAH"), workspace.DefaultCurrency);
        Assert.Equal(T0, workspace.UpdatedAt);
    }

    [Fact]
    public void Suspend_transitions_active_to_suspended()
    {
        var workspace = CreateActive();
        workspace.Suspend(T1);

        Assert.Equal(FinanceWorkspaceStatus.Suspended, workspace.Status);
        Assert.Equal(T1, workspace.UpdatedAt);
    }

    [Fact]
    public void Suspend_rejects_when_already_suspended()
    {
        var workspace = CreateActive();
        workspace.Suspend(T1);

        Assert.Throws<InvalidOperationException>(() => workspace.Suspend(T2));
        Assert.Equal(T1, workspace.UpdatedAt);
    }

    [Fact]
    public void Reactivate_transitions_suspended_to_active()
    {
        var workspace = CreateActive();
        workspace.Suspend(T1);
        workspace.Reactivate(T2);

        Assert.Equal(FinanceWorkspaceStatus.Active, workspace.Status);
        Assert.Equal(T2, workspace.UpdatedAt);
    }

    [Fact]
    public void Reactivate_rejects_archived_workspace()
    {
        var workspace = CreateActive();
        workspace.Archive(T1);

        Assert.Throws<InvalidOperationException>(() => workspace.Reactivate(T2));
    }

    [Fact]
    public void Reactivate_rejects_active_workspace()
    {
        var workspace = CreateActive();
        Assert.Throws<InvalidOperationException>(() => workspace.Reactivate(T1));
    }

    [Fact]
    public void Archive_from_active_is_terminal()
    {
        var workspace = CreateActive();
        workspace.Archive(T1);

        Assert.Equal(FinanceWorkspaceStatus.Archived, workspace.Status);
        Assert.Throws<InvalidOperationException>(() => workspace.Reactivate(T2));
        Assert.Throws<InvalidOperationException>(() => workspace.Suspend(T2));
        Assert.Throws<InvalidOperationException>(() => workspace.Archive(T2));
    }

    [Fact]
    public void Archive_from_suspended_is_terminal()
    {
        var workspace = CreateActive();
        workspace.Suspend(T1);
        workspace.Archive(T2);

        Assert.Equal(FinanceWorkspaceStatus.Archived, workspace.Status);
        Assert.Throws<InvalidOperationException>(() => workspace.Reactivate(T2));
    }

    [Fact]
    public void NameMaxLength_is_exposed()
    {
        Assert.Equal(200, FinanceWorkspace.NameMaxLength);
    }
}
