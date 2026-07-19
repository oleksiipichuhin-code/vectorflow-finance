using VectorFlow.Finance.Domain.JournalEntries;
using Xunit;

namespace VectorFlow.Finance.Domain.Tests.JournalEntries;

public sealed class JournalEntryLineIdTests
{
    [Fact]
    public void Constructor_rejects_empty_guid()
    {
        Assert.Throws<ArgumentException>(() => new JournalEntryLineId(Guid.Empty));
    }

    [Fact]
    public void New_produces_non_empty_id()
    {
        var id = JournalEntryLineId.New();
        Assert.NotEqual(Guid.Empty, id.Value);
    }
}
