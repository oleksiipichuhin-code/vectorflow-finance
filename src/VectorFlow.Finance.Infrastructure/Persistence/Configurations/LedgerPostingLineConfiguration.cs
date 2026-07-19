using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class LedgerPostingLineConfiguration : IEntityTypeConfiguration<LedgerPostingLine>
{
    public void Configure(EntityTypeBuilder<LedgerPostingLine> builder)
    {
        builder.ToTable("LedgerPostingLines");

        builder.HasKey(line => line.Id);

        builder.Property(line => line.Id)
            .HasConversion(
                id => id.Value,
                value => new LedgerPostingLineId(value))
            .ValueGeneratedNever();

        builder.Property(line => line.SourceJournalEntryLineId)
            .HasConversion(
                id => id.Value,
                value => new JournalEntryLineId(value))
            .IsRequired();

        builder.Property(line => line.FinancialAccountId)
            .HasConversion(
                id => id.Value,
                value => new AccountId(value))
            .IsRequired();

        // Same decimal policy as JournalEntryLine: CLR decimal, provider default.
        builder.Property(line => line.Debit)
            .IsRequired();

        builder.Property(line => line.Credit)
            .IsRequired();

        builder.Property(line => line.Description)
            .HasMaxLength(LedgerPostingLine.DescriptionMaxLength);

        builder.Property(line => line.Sequence)
            .IsRequired();

        builder.Property<LedgerPostingId>("LedgerPostingId")
            .HasConversion(
                id => id.Value,
                value => new LedgerPostingId(value))
            .IsRequired();

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(line => line.FinancialAccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex("LedgerPostingId")
            .HasDatabaseName("IX_LedgerPostingLines_LedgerPostingId");

        builder.HasIndex(line => line.FinancialAccountId)
            .HasDatabaseName("IX_LedgerPostingLines_FinancialAccountId");

        builder.HasIndex("LedgerPostingId", nameof(LedgerPostingLine.SourceJournalEntryLineId))
            .IsUnique()
            .HasDatabaseName("IX_LedgerPostingLines_LedgerPostingId_SourceJournalEntryLineId");

        builder.HasIndex("LedgerPostingId", nameof(LedgerPostingLine.Sequence))
            .IsUnique()
            .HasDatabaseName("IX_LedgerPostingLines_LedgerPostingId_Sequence");
    }
}
