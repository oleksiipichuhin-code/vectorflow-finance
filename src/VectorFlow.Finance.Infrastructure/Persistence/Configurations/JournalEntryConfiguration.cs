using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class JournalEntryConfiguration : IEntityTypeConfiguration<JournalEntry>
{
    public const string LinesFieldName = "_lines";

    public void Configure(EntityTypeBuilder<JournalEntry> builder)
    {
        builder.ToTable("JournalEntries");

        builder.HasKey(entry => entry.Id);

        builder.Property(entry => entry.Id)
            .HasConversion(
                id => id.Value,
                value => new JournalEntryId(value))
            .ValueGeneratedNever();

        builder.Property(entry => entry.FinanceWorkspaceId)
            .HasConversion(
                id => id.Value,
                value => new FinanceWorkspaceId(value))
            .IsRequired();

        builder.Property(entry => entry.Name)
            .HasMaxLength(JournalEntry.NameMaxLength)
            .IsRequired();

        builder.Property(entry => entry.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(entry => entry.CreatedAt)
            .IsRequired();

        builder.Property(entry => entry.UpdatedAt)
            .IsRequired();

        builder.Property(entry => entry.PostedAt);

        builder.Ignore(entry => entry.DomainEvents);
        builder.Ignore(entry => entry.TotalDebit);
        builder.Ignore(entry => entry.TotalCredit);
        builder.Ignore(entry => entry.IsBalanced);

        builder.HasOne<FinanceWorkspace>()
            .WithMany()
            .HasForeignKey(entry => entry.FinanceWorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(entry => entry.Lines)
            .WithOne()
            .HasForeignKey("JournalEntryId")
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired()
            .HasPrincipalKey(entry => entry.Id);

        builder.Navigation(entry => entry.Lines)
            .HasField(LinesFieldName)
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasIndex(entry => entry.FinanceWorkspaceId)
            .HasDatabaseName("IX_JournalEntries_FinanceWorkspaceId");

        builder.HasIndex(entry => new { entry.FinanceWorkspaceId, entry.CreatedAt })
            .HasDatabaseName("IX_JournalEntries_FinanceWorkspaceId_CreatedAt");
    }
}
