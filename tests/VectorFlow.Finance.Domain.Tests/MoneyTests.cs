using VectorFlow.Finance.Domain;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests;

public sealed class MoneyTests
{
    [Fact]
    public void Constructor_stores_decimal_amount_and_normalized_currency()
    {
        var money = new Money(125.50m, "uah");

        Assert.Equal(125.50m, money.Amount);
        Assert.Equal("UAH", money.Currency);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_rejects_invalid_currency(string? currency)
    {
        Assert.Throws<ArgumentException>(() => new Money(10m, currency!));
    }

    [Fact]
    public void Equal_amount_and_currency_are_equal()
    {
        var left = new Money(10m, "USD");
        var right = new Money(10m, "usd");

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
    }

    [Fact]
    public void Different_currency_values_are_not_equal()
    {
        var left = new Money(10m, "USD");
        var right = new Money(10m, "EUR");

        Assert.NotEqual(left, right);
    }
}
