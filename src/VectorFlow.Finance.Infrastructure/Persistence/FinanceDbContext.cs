using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Infrastructure.Persistence;

public sealed class FinanceDbContext : DbContext
{
    public FinanceDbContext(DbContextOptions<FinanceDbContext> options)
        : base(options)
    {
    }

    public DbSet<FinanceWorkspace> FinanceWorkspaces => Set<FinanceWorkspace>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(FinanceDbContext).Assembly);
        base.OnModelCreating(modelBuilder);
    }
}
