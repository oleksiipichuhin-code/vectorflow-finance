using VectorFlow.Finance.Domain.Workspaces;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Workspaces;

public sealed class FinanceWorkspaceIdTests
{
    [Fact]
    public void Constructor_accepts_non_empty_guid()
    {
        var value = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var id = new FinanceWorkspaceId(value);

        Assert.Equal(value, id.Value);
    }

    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new FinanceWorkspaceId(Guid.Empty));
    }

    [Fact]
    public void Equal_values_are_equal()
    {
        var value = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var left = new FinanceWorkspaceId(value);
        var right = new FinanceWorkspaceId(value);

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
    }

    [Fact]
    public void New_creates_non_empty_id()
    {
        var id = FinanceWorkspaceId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }
}
