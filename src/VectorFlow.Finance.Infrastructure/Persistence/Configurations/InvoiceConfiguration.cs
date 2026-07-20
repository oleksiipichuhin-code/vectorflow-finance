using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public const string LinesFieldName = "_lines";

    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("Invoices");

        builder.HasKey(invoice => invoice.Id);

        builder.Property(invoice => invoice.Id)
            .HasConversion(
                id => id.Value,
                value => new InvoiceId(value))
            .ValueGeneratedNever();

        builder.Property(invoice => invoice.FinanceWorkspaceId)
            .HasConversion(
                id => id.Value,
                value => new FinanceWorkspaceId(value))
            .IsRequired();

        builder.Property(invoice => invoice.DocumentNumber)
            .HasMaxLength(Invoice.DocumentNumberMaxLength)
            .IsRequired();

        builder.Property(invoice => invoice.CounterpartyReference)
            .HasConversion(
                reference => reference.Value,
                value => new CounterpartyReference(value))
            .HasMaxLength(CounterpartyReference.MaxLength)
            .IsRequired();

        builder.Property(invoice => invoice.Currency)
            .HasConversion(
                currency => currency.Code,
                code => new Currency(code))
            .HasMaxLength(16)
            .IsRequired();

        builder.Property(invoice => invoice.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(invoice => invoice.CreatedAt)
            .IsRequired();

        builder.Property(invoice => invoice.UpdatedAt)
            .IsRequired();

        builder.Property(invoice => invoice.IssuedAt);

        builder.Property(invoice => invoice.DueDate);

        builder.Ignore(invoice => invoice.DomainEvents);
        builder.Ignore(invoice => invoice.TotalAmount);

        builder.HasOne<FinanceWorkspace>()
            .WithMany()
            .HasForeignKey(invoice => invoice.FinanceWorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(invoice => invoice.Lines)
            .WithOne()
            .HasForeignKey("InvoiceId")
            .OnDelete(DeleteBehavior.Cascade)
            .IsRequired()
            .HasPrincipalKey(invoice => invoice.Id);

        builder.Navigation(invoice => invoice.Lines)
            .HasField(LinesFieldName)
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasIndex(invoice => invoice.FinanceWorkspaceId)
            .HasDatabaseName("IX_Invoices_FinanceWorkspaceId");
    }
}
