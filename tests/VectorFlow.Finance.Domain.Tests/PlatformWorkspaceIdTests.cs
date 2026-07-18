using VectorFlow.Finance.Domain;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests;

public sealed class PlatformWorkspaceIdTests
{
    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new PlatformWorkspaceId(Guid.Empty));
    }

    [Fact]
    public void Equal_values_are_equal()
    {
        var id = Guid.Parse("22222222-2222-2222-2222-222222222222");
        var left = new PlatformWorkspaceId(id);
        var right = new PlatformWorkspaceId(id);

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
    }
}
