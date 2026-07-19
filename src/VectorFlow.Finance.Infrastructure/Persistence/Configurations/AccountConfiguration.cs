using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence.Configurations;

public sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public const string CodeNormalizedPropertyName = "CodeNormalized";

    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("Accounts");

        builder.HasKey(account => account.Id);

        builder.Property(account => account.Id)
            .HasConversion(
                id => id.Value,
                value => new AccountId(value))
            .ValueGeneratedNever();

        builder.Property(account => account.FinanceWorkspaceId)
            .HasConversion(
                id => id.Value,
                value => new FinanceWorkspaceId(value))
            .IsRequired();

        builder.Property(account => account.Code)
            .HasConversion(
                code => code.Value,
                value => new AccountCode(value))
            .HasMaxLength(AccountCode.MaxLength)
            .IsRequired();

        // Shadow property for case-insensitive uniqueness and lookups.
        // Display casing remains in Code; uniqueness uses OrdinalIgnoreCase semantics via invariant upper.
        builder.Property<string>(CodeNormalizedPropertyName)
            .HasMaxLength(AccountCode.MaxLength)
            .IsRequired();

        builder.Property(account => account.Name)
            .HasMaxLength(Account.NameMaxLength)
            .IsRequired();

        builder.Property(account => account.Type)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(account => account.Status)
            .HasConversion<int>()
            .IsRequired();

        builder.Property(account => account.CreatedAt)
            .IsRequired();

        builder.Property(account => account.UpdatedAt)
            .IsRequired();

        builder.Property(account => account.ArchivedAt);

        builder.Ignore(account => account.DomainEvents);

        builder.HasOne<FinanceWorkspace>()
            .WithMany()
            .HasForeignKey(account => account.FinanceWorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(account => account.FinanceWorkspaceId)
            .HasDatabaseName("IX_Accounts_FinanceWorkspaceId");

        builder.HasIndex(nameof(Account.FinanceWorkspaceId), CodeNormalizedPropertyName)
            .IsUnique()
            .HasDatabaseName("IX_Accounts_FinanceWorkspaceId_CodeNormalized");
    }
}
