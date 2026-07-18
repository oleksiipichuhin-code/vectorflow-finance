using Xunit;

namespace VectorFlow.Finance.Domain.Tests;

public sealed class CurrencyTests
{
    [Fact]
    public void Constructor_normalizes_code()
    {
        var currency = new Currency(" uah ");
        Assert.Equal("UAH", currency.Code);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_rejects_invalid_code(string? code)
    {
        Assert.Throws<ArgumentException>(() => new Currency(code!));
    }

    [Fact]
    public void Equal_codes_are_equal()
    {
        Assert.Equal(new Currency("USD"), new Currency("usd"));
    }
}
