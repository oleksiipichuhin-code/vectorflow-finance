using VectorFlow.Finance.Domain.Accounts;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Accounts;

public sealed class AccountIdTests
{
    [Fact]
    public void Constructor_accepts_non_empty_guid()
    {
        var value = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var id = new AccountId(value);

        Assert.Equal(value, id.Value);
    }

    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new AccountId(Guid.Empty));
    }

    [Fact]
    public void Equal_values_are_equal()
    {
        var value = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var left = new AccountId(value);
        var right = new AccountId(value);

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
    }

    [Fact]
    public void New_creates_non_empty_id()
    {
        var id = AccountId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }
}
