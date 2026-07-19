using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class JournalEntryLineConfiguration : IEntityTypeConfiguration<JournalEntryLine>
{
    public void Configure(EntityTypeBuilder<JournalEntryLine> builder)
    {
        builder.ToTable("JournalEntryLines");

        builder.HasKey(line => line.Id);

        builder.Property(line => line.Id)
            .HasConversion(
                id => id.Value,
                value => new JournalEntryLineId(value))
            .ValueGeneratedNever();

        builder.Property(line => line.FinancialAccountId)
            .HasConversion(
                id => id.Value,
                value => new AccountId(value))
            .IsRequired();

        // No project-wide money precision policy yet (Money is unmapped).
        // Store full CLR decimal; provider default type. See OWNER REPORT.
        builder.Property(line => line.Debit)
            .IsRequired();

        builder.Property(line => line.Credit)
            .IsRequired();

        builder.Property(line => line.Description)
            .HasMaxLength(JournalEntryLine.DescriptionMaxLength);

        builder.Property(line => line.Sequence)
            .IsRequired();

        builder.Property<JournalEntryId>("JournalEntryId")
            .HasConversion(
                id => id.Value,
                value => new JournalEntryId(value))
            .IsRequired();

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(line => line.FinancialAccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex("JournalEntryId")
            .HasDatabaseName("IX_JournalEntryLines_JournalEntryId");

        builder.HasIndex(line => line.FinancialAccountId)
            .HasDatabaseName("IX_JournalEntryLines_FinancialAccountId");

        builder.HasIndex("JournalEntryId", nameof(JournalEntryLine.Sequence))
            .IsUnique()
            .HasDatabaseName("IX_JournalEntryLines_JournalEntryId_Sequence");
    }
}
