using VectorFlow.Finance.Domain.Accounts;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.Accounts;

public sealed class AccountCodeTests
{
    [Fact]
    public void Constructor_trims_and_preserves_casing()
    {
        var code = new AccountCode("  Cash.Bank-1/A  ");

        Assert.Equal("Cash.Bank-1/A", code.Value);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_rejects_blank(string? value)
    {
        Assert.Throws<ArgumentException>(() => new AccountCode(value!));
    }

    [Fact]
    public void Constructor_accepts_max_length()
    {
        var value = new string('A', AccountCode.MaxLength);
        var code = new AccountCode(value);

        Assert.Equal(value, code.Value);
    }

    [Fact]
    public void Constructor_rejects_over_max_length()
    {
        var value = new string('A', AccountCode.MaxLength + 1);
        Assert.Throws<ArgumentException>(() => new AccountCode(value));
    }

    [Theory]
    [InlineData("1000")]
    [InlineData("1.2.3")]
    [InlineData("A-1")]
    [InlineData("REV/100")]
    [InlineData("abC123")]
    public void Constructor_accepts_allowed_characters(string value)
    {
        var code = new AccountCode(value);
        Assert.Equal(value, code.Value);
    }

    [Theory]
    [InlineData("1000$")]
    [InlineData("A B")]
    [InlineData("code_1")]
    [InlineData("a@b")]
    public void Constructor_rejects_disallowed_characters(string value)
    {
        Assert.Throws<ArgumentException>(() => new AccountCode(value));
    }

    [Fact]
    public void Constructor_rejects_control_characters()
    {
        Assert.Throws<ArgumentException>(() => new AccountCode("1000\t2000"));
        Assert.Throws<ArgumentException>(() => new AccountCode("1000\n2000"));
    }

    [Fact]
    public void Equality_is_case_insensitive_and_preserves_original_value()
    {
        var left = new AccountCode("Cash");
        var right = new AccountCode("cash");

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
        Assert.Equal("Cash", left.Value);
        Assert.Equal("cash", right.Value);
    }

    [Fact]
    public void Trimmed_equivalent_values_compare_equal()
    {
        var left = new AccountCode("  ABC  ");
        var right = new AccountCode("ABC");

        Assert.Equal(left, right);
        Assert.Equal(left.GetHashCode(), right.GetHashCode());
        Assert.Equal("ABC", left.Value);
    }

    [Theory]
    [InlineData(".")]
    [InlineData("-")]
    [InlineData("/")]
    public void Constructor_accepts_each_allowed_separator(string separator)
    {
        var value = $"A{separator}1";
        Assert.Equal(value, new AccountCode(value).Value);
    }

    [Fact]
    public void Different_codes_are_not_equal()
    {
        Assert.NotEqual(new AccountCode("1000"), new AccountCode("1001"));
    }

    [Fact]
    public void MaxLength_is_exposed()
    {
        Assert.Equal(32, AccountCode.MaxLength);
    }
}
