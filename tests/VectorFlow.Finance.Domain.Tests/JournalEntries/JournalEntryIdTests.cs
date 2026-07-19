using VectorFlow.Finance.Domain.JournalEntries;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.JournalEntries;

public sealed class JournalEntryIdTests
{
    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new JournalEntryId(Guid.Empty));
    }

    [Fact]
    public void New_produces_non_empty_id()
    {
        var id = JournalEntryId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }

    [Fact]
    public void Equality_is_by_value()
    {
        var guid = Guid.Parse("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        Assert.Equal(new JournalEntryId(guid), new JournalEntryId(guid));
    }
}
