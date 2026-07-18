using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace VectorFlow.Finance.Infrastructure.Persistence;

/// <summary>
/// Design-time factory for EF Core migrations tooling.
/// </summary>
public sealed class FinanceDbContextFactory : IDesignTimeDbContextFactory<FinanceDbContext>
{
    public FinanceDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<FinanceDbContext>();
        optionsBuilder.UseSqlite(DependencyInjection.DefaultSqliteConnectionString);
        return new FinanceDbContext(optionsBuilder.Options);
    }
}
