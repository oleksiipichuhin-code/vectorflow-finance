using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class AccrualConfiguration : IEntityTypeConfiguration<Accrual>
{
    public void Configure(EntityTypeBuilder<Accrual> builder)
    {
        builder.ToTable("Accruals");

        builder.HasKey(accrual => accrual.Id);

        builder.Property(accrual => accrual.Id)
            .HasConversion(
                id => id.Value,
                value => new AccrualId(value))
            .ValueGeneratedNever();

        builder.Property(accrual => accrual.FinanceWorkspaceId)
            .HasConversion(
                id => id.Value,
                value => new FinanceWorkspaceId(value))
            .IsRequired();

        builder.Property(accrual => accrual.Type)
            .HasConversion<int>()
            .IsRequired();

        // Store full CLR decimal; provider default type. Same policy as Invoice/Journal lines.
        builder.Property(accrual => accrual.Amount)
            .IsRequired();

        builder.Property(accrual => accrual.Currency)
            .HasConversion(
                currency => currency.Code,
                code => new Currency(code))
            .HasMaxLength(16)
            .IsRequired();

        builder.Property(accrual => accrual.RecognitionDate)
            .IsRequired();

        builder.Property(accrual => accrual.Description)
            .HasMaxLength(Accrual.DescriptionMaxLength)
            .IsRequired();

        builder.Property(accrual => accrual.SourceInvoiceId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new InvoiceId(value.Value) : null);

        builder.Property(accrual => accrual.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(accrual => accrual.CreatedAt)
            .IsRequired();

        builder.Property(accrual => accrual.UpdatedAt)
            .IsRequired();

        builder.Property(accrual => accrual.RecognizedAt);

        builder.Property(accrual => accrual.ReversedAt);

        builder.Property(accrual => accrual.ReversalReason)
            .HasMaxLength(Accrual.ReversalReasonMaxLength);

        builder.Ignore(accrual => accrual.DomainEvents);

        builder.HasOne<FinanceWorkspace>()
            .WithMany()
            .HasForeignKey(accrual => accrual.FinanceWorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(accrual => accrual.FinanceWorkspaceId)
            .HasDatabaseName("IX_Accruals_FinanceWorkspaceId");
    }
}
