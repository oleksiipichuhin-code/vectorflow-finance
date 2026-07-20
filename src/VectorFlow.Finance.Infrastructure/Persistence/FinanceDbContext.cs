using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.JournalEntries;
using VectorFlow.Finance.Domain.Ledger;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence.Configurations;

namespace VectorFlow.Finance.Infrastructure.Persistence;

public sealed class FinanceDbContext : DbContext
{
    public FinanceDbContext(DbContextOptions<FinanceDbContext> options)
        : base(options)
    {
    }

    public DbSet<FinanceWorkspace> FinanceWorkspaces => Set<FinanceWorkspace>();

    public DbSet<Account> Accounts => Set<Account>();

    public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();

    public DbSet<JournalEntryLine> JournalEntryLines => Set<JournalEntryLine>();

    public DbSet<LedgerPosting> LedgerPostings => Set<LedgerPosting>();

    public DbSet<LedgerPostingLine> LedgerPostingLines => Set<LedgerPostingLine>();

    public DbSet<Invoice> Invoices => Set<Invoice>();

    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        SyncAccountCodeNormalized();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        SyncAccountCodeNormalized();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FinanceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }

    private void SyncAccountCodeNormalized()
    {
        foreach (var entry in ChangeTracker.Entries<Account>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified))
            {
                continue;
            }

            entry.Property(AccountConfiguration.CodeNormalizedPropertyName).CurrentValue =
                entry.Entity.Code.Value.ToUpperInvariant();
        }
    }
}
