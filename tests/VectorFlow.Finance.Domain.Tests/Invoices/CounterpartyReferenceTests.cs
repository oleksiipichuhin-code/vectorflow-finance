using VectorFlow.Finance.Domain.Invoices;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Invoices;

public sealed class CounterpartyReferenceTests
{
    [Fact]
    public void Constructor_trims_and_preserves_value()
    {
        var reference = new CounterpartyReference("  crm-partner-42  ");
        Assert.Equal("crm-partner-42", reference.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_rejects_blank(string? value)
    {
        Assert.Throws<ArgumentException>(() => new CounterpartyReference(value!));
    }

    [Fact]
    public void Constructor_rejects_overlength()
    {
        var value = new string('A', CounterpartyReference.MaxLength + 1);
        Assert.Throws<ArgumentException>(() => new CounterpartyReference(value));
    }

    [Fact]
    public void Equality_is_by_ordinal_value()
    {
        Assert.Equal(
            new CounterpartyReference("partner-1"),
            new CounterpartyReference("partner-1"));
        Assert.NotEqual(
            new CounterpartyReference("partner-1"),
            new CounterpartyReference("Partner-1"));
    }
}
