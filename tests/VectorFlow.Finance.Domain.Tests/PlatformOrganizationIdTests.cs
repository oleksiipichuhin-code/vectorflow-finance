using VectorFlow.Finance.Domain;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests;

public sealed class PlatformOrganizationIdTests
{
    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new PlatformOrganizationId(Guid.Empty));
    }

    [Fact]
    public void Equal_values_are_equal()
    {
        var id = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var left = new PlatformOrganizationId(id);
        var right = new PlatformOrganizationId(id);

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
    }

    [Fact]
    public void New_creates_non_empty_id()
    {
        var id = PlatformOrganizationId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }
}
