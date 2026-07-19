using VectorFlow.Finance.Domain.Invoices;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Invoices;

public sealed class InvoiceLineIdTests
{
    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new InvoiceLineId(Guid.Empty));
    }

    [Fact]
    public void New_produces_non_empty_id()
    {
        var id = InvoiceLineId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }

    [Fact]
    public void Equality_is_by_value()
    {
        var guid = Guid.Parse("bbbbbbbb-cccc-dddd-eeee-ffffffffffff");
        Assert.Equal(new InvoiceLineId(guid), new InvoiceLineId(guid));
    }
}
