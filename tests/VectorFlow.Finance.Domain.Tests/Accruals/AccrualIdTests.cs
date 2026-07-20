using VectorFlow.Finance.Domain.Accruals;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Accruals;

public sealed class AccrualIdTests
{
    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new AccrualId(Guid.Empty));
    }

    [Fact]
    public void New_produces_non_empty_id()
    {
        var id = AccrualId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }

    [Fact]
    public void Equality_is_by_value()
    {
        var guid = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        Assert.Equal(new AccrualId(guid), new AccrualId(guid));
    }
}
