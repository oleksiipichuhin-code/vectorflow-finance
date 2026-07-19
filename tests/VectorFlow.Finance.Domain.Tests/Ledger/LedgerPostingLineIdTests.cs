using VectorFlow.Finance.Domain.Ledger;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Ledger;

public sealed class LedgerPostingLineIdTests
{
    [Fact]
    public void New_returns_non_empty()
    {
        var id = LedgerPostingLineId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }

    [Fact]
    public void From_valid_value()
    {
        var guid = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc");
        var id = LedgerPostingLineId.From(guid);
        Assert.Equal(guid, id.Value);
    }

    [Fact]
    public void From_rejects_empty()
    {
        Assert.Throws<ArgumentException>(() => LedgerPostingLineId.From(Guid.Empty));
    }

    [Fact]
    public void Equality_is_by_value()
    {
        var guid = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd");
        Assert.Equal(LedgerPostingLineId.From(guid), LedgerPostingLineId.From(guid));
    }

    [Fact]
    public void Different_values_are_not_equal()
    {
        Assert.NotEqual(LedgerPostingLineId.New(), LedgerPostingLineId.New());
    }
}
