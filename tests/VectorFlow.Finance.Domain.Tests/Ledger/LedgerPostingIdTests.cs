using VectorFlow.Finance.Domain.Ledger;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Ledger;

public sealed class LedgerPostingIdTests
{
    [Fact]
    public void New_returns_non_empty()
    {
        var id = LedgerPostingId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }

    [Fact]
    public void From_valid_value()
    {
        var guid = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var id = LedgerPostingId.From(guid);
        Assert.Equal(guid, id.Value);
    }

    [Fact]
    public void From_rejects_empty()
    {
        Assert.Throws<ArgumentException>(() => LedgerPostingId.From(Guid.Empty));
    }

    [Fact]
    public void Equality_is_by_value()
    {
        var guid = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        Assert.Equal(LedgerPostingId.From(guid), LedgerPostingId.From(guid));
    }

    [Fact]
    public void Different_values_are_not_equal()
    {
        Assert.NotEqual(LedgerPostingId.New(), LedgerPostingId.New());
    }
}
