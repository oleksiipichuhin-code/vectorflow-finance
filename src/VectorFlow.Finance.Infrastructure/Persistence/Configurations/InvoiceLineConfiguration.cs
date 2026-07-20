using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain.Invoices;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class InvoiceLineConfiguration : IEntityTypeConfiguration<InvoiceLine>
{
    public void Configure(EntityTypeBuilder<InvoiceLine> builder)
    {
        builder.ToTable("InvoiceLines");

        builder.HasKey(line => line.Id);

        builder.Property(line => line.Id)
            .HasConversion(
                id => id.Value,
                value => new InvoiceLineId(value))
            .ValueGeneratedNever();

        // No project-wide money precision policy yet (Money is unmapped).
        // Store full CLR decimal; provider default type. See OWNER REPORT.
        builder.Property(line => line.Quantity)
            .IsRequired();

        builder.Property(line => line.UnitPrice)
            .IsRequired();

        builder.Property(line => line.LineAmount)
            .IsRequired();

        builder.Property(line => line.Description)
            .HasMaxLength(InvoiceLine.DescriptionMaxLength);

        builder.Property(line => line.Sequence)
            .IsRequired();

        builder.Property<InvoiceId>("InvoiceId")
            .HasConversion(
                id => id.Value,
                value => new InvoiceId(value))
            .IsRequired();

        builder.HasIndex("InvoiceId")
            .HasDatabaseName("IX_InvoiceLines_InvoiceId");

        builder.HasIndex("InvoiceId", nameof(InvoiceLine.Sequence))
            .IsUnique()
            .HasDatabaseName("IX_InvoiceLines_InvoiceId_Sequence");
    }
}
