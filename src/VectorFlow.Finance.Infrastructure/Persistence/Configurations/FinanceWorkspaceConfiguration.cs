using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class FinanceWorkspaceConfiguration : IEntityTypeConfiguration<FinanceWorkspace>
{
    public void Configure(EntityTypeBuilder<FinanceWorkspace> builder)
    {
        builder.ToTable("FinanceWorkspaces");

        builder.HasKey(workspace => workspace.Id);

        builder.Property(workspace => workspace.Id)
            .HasConversion(
                id => id.Value,
                value => new FinanceWorkspaceId(value))
            .ValueGeneratedNever();

        builder.Property(workspace => workspace.PlatformOrganizationId)
            .HasConversion(
                id => id.Value,
                value => new PlatformOrganizationId(value))
            .IsRequired();

        builder.Property(workspace => workspace.PlatformWorkspaceId)
            .HasConversion(
                id => id.Value,
                value => new PlatformWorkspaceId(value))
            .IsRequired();

        builder.Property(workspace => workspace.Name)
            .HasMaxLength(FinanceWorkspace.NameMaxLength)
            .IsRequired();

        builder.Property(workspace => workspace.DefaultCurrency)
            .HasConversion(
                currency => currency.Code,
                code => new Currency(code))
            .HasMaxLength(16)
            .IsRequired();

        builder.Property(workspace => workspace.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(workspace => workspace.CreatedAt)
            .IsRequired();

        builder.Property(workspace => workspace.UpdatedAt)
            .IsRequired();

        builder.HasIndex(workspace => new
            {
                workspace.PlatformOrganizationId,
                workspace.PlatformWorkspaceId
            })
            .IsUnique()
            .HasDatabaseName("IX_FinanceWorkspaces_PlatformOrganizationId_PlatformWorkspaceId");
    }
}
