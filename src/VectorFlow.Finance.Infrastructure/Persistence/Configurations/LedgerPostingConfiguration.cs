using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class LedgerPostingConfiguration : IEntityTypeConfiguration<LedgerPosting>
{
    public const string LinesFieldName = "_lines";

    public void Configure(EntityTypeBuilder<LedgerPosting> builder)
    {
        builder.ToTable("LedgerPostings");

        builder.HasKey(posting => posting.Id);

        builder.Property(posting => posting.Id)
            .HasConversion(
                id => id.Value,
                value => new LedgerPostingId(value))
            .ValueGeneratedNever();

        builder.Property(posting => posting.FinanceWorkspaceId)
            .HasConversion(
                id => id.Value,
                value => new FinanceWorkspaceId(value))
            .IsRequired();

        builder.Property(posting => posting.JournalEntryId)
            .HasConversion(
                id => id.Value,
                value => new JournalEntryId(value))
            .IsRequired();

        builder.Property(posting => posting.PostedAtUtc)
            .IsRequired();

        builder.Ignore(posting => posting.DomainEvents);
        builder.Ignore(posting => posting.TotalDebit);
        builder.Ignore(posting => posting.TotalCredit);

        builder.HasOne<FinanceWorkspace>()
            .WithMany()
            .HasForeignKey(posting => posting.FinanceWorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<JournalEntry>()
            .WithMany()
            .HasForeignKey(posting => posting.JournalEntryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(posting => posting.Lines)
            .WithOne()
            .HasForeignKey("LedgerPostingId")
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired()
            .HasPrincipalKey(posting => posting.Id);

        builder.Navigation(posting => posting.Lines)
            .HasField(LinesFieldName)
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasIndex(posting => posting.JournalEntryId)
            .IsUnique()
            .HasDatabaseName("IX_LedgerPostings_JournalEntryId");

        builder.HasIndex(posting => posting.FinanceWorkspaceId)
            .HasDatabaseName("IX_LedgerPostings_FinanceWorkspaceId");

        builder.HasIndex(posting => new { posting.FinanceWorkspaceId, posting.PostedAtUtc })
            .HasDatabaseName("IX_LedgerPostings_FinanceWorkspaceId_PostedAtUtc");
    }
}
