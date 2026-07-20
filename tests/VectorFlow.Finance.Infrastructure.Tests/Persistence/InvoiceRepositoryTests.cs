using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Domain;
using VectorFlow.Finance.Domain.Invoices;
using VectorFlow.Finance.Domain.Workspaces;
using VectorFlow.Finance.Infrastructure.Persistence;
using VectorFlow.Finance.Infrastructure.Persistence.Repositories;
using Xunit;

namespace VectorFlow.Finance.Infrastructure.Tests.Persistence;

public sealed class InvoiceRepositoryTests : IAsyncLifetime
{
    private static readonly DateTimeOffset T0 =
        new(2026, 7, 19, 12, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T1 =
        new(2026, 7, 19, 13, 0, 0, TimeSpan.Zero);

    private static readonly DateTimeOffset T2 =
        new(2026, 7, 19, 14, 0, 0, TimeSpan.Zero);

    private SqliteConnection _connection = null!;
    private FinanceDbContext _dbContext = null!;
    private InvoiceRepository _repository = null!;
    private FinanceWorkspaceId _workspaceA;
    private FinanceWorkspaceId _workspaceB;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _dbContext = CreateContext();
        await _dbContext.Database.MigrateAsync();
        _repository = new InvoiceRepository(_dbContext);

        _workspaceA = await SeedWorkspaceAsync(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            "Workspace A");
        _workspaceB = await SeedWorkspaceAsync(
            Guid.Parse("33333333-3333-3333-3333-333333333333"),
            Guid.Parse("44444444-4444-4444-4444-444444444444"),
            "Workspace B");
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Add_and_GetById_round_trips_invoice()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-001",
            new CounterpartyReference("cp-1"),
            new Currency("uah"),
            T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        Assert.Equal(invoice.Id, loaded.Id);
        Assert.Equal(_workspaceA, loaded.FinanceWorkspaceId);
        Assert.Equal("INV-001", loaded.DocumentNumber);
        Assert.Equal("cp-1", loaded.CounterpartyReference.Value);
        Assert.Equal("UAH", loaded.Currency.Code);
        Assert.Equal(InvoiceStatus.Draft, loaded.Status);
        Assert.Equal(T0, loaded.CreatedAt);
        Assert.Equal(T0, loaded.UpdatedAt);
        Assert.Null(loaded.DueDate);
        Assert.Null(loaded.IssuedAt);
        Assert.Empty(loaded.Lines);
        Assert.Equal(0m, loaded.TotalAmount);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task GetById_wrong_workspace_returns_null()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-SCOPE",
            new CounterpartyReference("cp-scope"),
            new Currency("USD"),
            T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        var loaded = await _repository.GetByIdAsync(_workspaceB, invoice.Id);

        Assert.Null(loaded);
    }

    [Fact]
    public async Task ListByWorkspace_returns_only_workspace_newest_first()
    {
        var older = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-OLD",
            new CounterpartyReference("cp-old"),
            new Currency("UAH"),
            T0);
        var newer = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-NEW",
            new CounterpartyReference("cp-new"),
            new Currency("UAH"),
            T1);
        var other = Invoice.Create(
            InvoiceId.New(),
            _workspaceB,
            "INV-OTHER",
            new CounterpartyReference("cp-other"),
            new Currency("USD"),
            T2);

        await _repository.AddAsync(older);
        await _repository.AddAsync(newer);
        await _repository.AddAsync(other);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var listed = await new InvoiceRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Equal(2, listed.Count);
        Assert.Equal(newer.Id, listed[0].Id);
        Assert.Equal(older.Id, listed[1].Id);
    }

    [Fact]
    public async Task ListByWorkspace_empty_returns_empty_collection()
    {
        await using var readContext = CreateContext();
        var listed = await new InvoiceRepository(readContext).ListByWorkspaceAsync(_workspaceA);

        Assert.Empty(listed);
    }

    [Fact]
    public async Task GetById_after_list_still_round_trips()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-GET",
            new CounterpartyReference("cp-get"),
            new Currency("EUR"),
            T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var repo = new InvoiceRepository(readContext);
        var listed = await repo.ListByWorkspaceAsync(_workspaceA);
        Assert.Equal(invoice.Id, Assert.Single(listed).Id);

        var loaded = await repo.GetByIdAsync(_workspaceA, invoice.Id);
        Assert.NotNull(loaded);
        Assert.Equal("INV-GET", loaded.DocumentNumber);
    }

    [Fact]
    public async Task GetById_same_workspace_returns_invoice()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-SAME",
            new CounterpartyReference("cp-same"),
            new Currency("EUR"),
            T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        Assert.Equal(invoice.Id, loaded.Id);
    }

    [Fact]
    public async Task Multiple_lines_round_trip_with_sequence_and_amounts()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-LINES",
            new CounterpartyReference("cp-lines"),
            new Currency("UAH"),
            T0);
        var line1 = invoice.AddLine(2m, 10.5m, "Widget", T0);
        var line2 = invoice.AddLine(1.25m, 8m, "Service", T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        Assert.Equal(2, loaded.Lines.Count);

        var first = loaded.Lines.Single(line => line.Sequence == 1);
        Assert.Equal(line1.Id, first.Id);
        Assert.Equal(2m, first.Quantity);
        Assert.Equal(10.5m, first.UnitPrice);
        Assert.Equal(21m, first.LineAmount);
        Assert.Equal("Widget", first.Description);

        var second = loaded.Lines.Single(line => line.Sequence == 2);
        Assert.Equal(line2.Id, second.Id);
        Assert.Equal(1.25m, second.Quantity);
        Assert.Equal(8m, second.UnitPrice);
        Assert.Equal(10m, second.LineAmount);
        Assert.Equal("Service", second.Description);

        Assert.Equal(31m, loaded.TotalAmount);
        Assert.Equal(
            new[] { 1, 2 },
            loaded.Lines.OrderBy(line => line.Sequence).Select(line => line.Sequence).ToArray());
    }

    [Fact]
    public async Task Draft_mutations_persist()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-OLD",
            new CounterpartyReference("cp-old"),
            new Currency("UAH"),
            T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        invoice.ChangeDocumentNumber("INV-NEW", T1);
        invoice.ChangeCounterpartyReference(new CounterpartyReference("cp-new"), T1);
        invoice.ChangeCurrency(new Currency("USD"), T1);
        invoice.SetDueDate(T2, T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        Assert.Equal("INV-NEW", loaded.DocumentNumber);
        Assert.Equal("cp-new", loaded.CounterpartyReference.Value);
        Assert.Equal("USD", loaded.Currency.Code);
        Assert.Equal(T2, loaded.DueDate);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Equal(InvoiceStatus.Draft, loaded.Status);
    }

    [Fact]
    public async Task Add_line_persists()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-ADD",
            new CounterpartyReference("cp-add"),
            new Currency("UAH"),
            T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        var line = invoice.AddLine(3m, 4m, "Added", T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        var persisted = Assert.Single(loaded.Lines);
        Assert.Equal(line.Id, persisted.Id);
        Assert.Equal(3m, persisted.Quantity);
        Assert.Equal(4m, persisted.UnitPrice);
        Assert.Equal(12m, persisted.LineAmount);
        Assert.Equal("Added", persisted.Description);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Equal(1, await readContext.InvoiceLines.CountAsync());
    }

    [Fact]
    public async Task Update_line_persists_without_duplicate_rows()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-UPD",
            new CounterpartyReference("cp-upd"),
            new Currency("UAH"),
            T0);
        var line = invoice.AddLine(1m, 10m, "Old", T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        invoice.UpdateLine(line.Id, 2m, 15m, "New", T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        var updated = Assert.Single(loaded.Lines);
        Assert.Equal(line.Id, updated.Id);
        Assert.Equal(2m, updated.Quantity);
        Assert.Equal(15m, updated.UnitPrice);
        Assert.Equal(30m, updated.LineAmount);
        Assert.Equal("New", updated.Description);
        Assert.Equal(T1, loaded.UpdatedAt);
        Assert.Equal(1, await readContext.InvoiceLines.CountAsync());
    }

    [Fact]
    public async Task Remove_line_persists()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-RM",
            new CounterpartyReference("cp-rm"),
            new Currency("UAH"),
            T0);
        var keep = invoice.AddLine(1m, 10m, "Keep", T0);
        var remove = invoice.AddLine(1m, 5m, "Remove", T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        invoice.RemoveLine(remove.Id, T1);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        var remaining = Assert.Single(loaded.Lines);
        Assert.Equal(keep.Id, remaining.Id);
        Assert.Equal(1, await readContext.InvoiceLines.CountAsync());
    }

    [Fact]
    public async Task Issue_persists_status_timestamps_and_lines()
    {
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-ISSUE",
            new CounterpartyReference("cp-issue"),
            new Currency("UAH"),
            T0);
        var line = invoice.AddLine(2m, 50m, "Issued line", T0);
        invoice.SetDueDate(T2, T0);
        invoice.Issue(T1);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        Assert.Equal(InvoiceStatus.Issued, loaded.Status);
        Assert.Equal(T1, loaded.IssuedAt);
        Assert.Equal(T2, loaded.DueDate);
        Assert.Equal(T1, loaded.UpdatedAt);
        var persisted = Assert.Single(loaded.Lines);
        Assert.Equal(line.Id, persisted.Id);
        Assert.Equal(100m, loaded.TotalAmount);
        Assert.Empty(loaded.DomainEvents);
    }

    [Fact]
    public async Task Decimal_precision_round_trip()
    {
        var quantity = 1.123456789m;
        var unitPrice = 9.87654321m;
        var invoice = Invoice.Create(
            InvoiceId.New(),
            _workspaceA,
            "INV-PREC",
            new CounterpartyReference("cp-prec"),
            new Currency("UAH"),
            T0);
        invoice.AddLine(quantity, unitPrice, null, T0);

        await _repository.AddAsync(invoice);
        await _repository.SaveChangesAsync();

        await using var readContext = CreateContext();
        var loaded = await new InvoiceRepository(readContext).GetByIdAsync(_workspaceA, invoice.Id);

        Assert.NotNull(loaded);
        var line = Assert.Single(loaded.Lines);
        Assert.Equal(quantity, line.Quantity);
        Assert.Equal(unitPrice, line.UnitPrice);
        Assert.Equal(quantity * unitPrice, line.LineAmount);
    }

    [Fact]
    public async Task Model_contains_invoice_tables_and_indexes()
    {
        var invoiceEntity = _dbContext.Model.FindEntityType(typeof(Invoice));
        var lineEntity = _dbContext.Model.FindEntityType(typeof(InvoiceLine));

        Assert.NotNull(invoiceEntity);
        Assert.Equal("Invoices", invoiceEntity.GetTableName());
        Assert.NotNull(lineEntity);
        Assert.Equal("InvoiceLines", lineEntity.GetTableName());

        Assert.Contains(
            invoiceEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_Invoices_FinanceWorkspaceId");
        Assert.DoesNotContain(
            invoiceEntity.GetIndexes(),
            index => index.Properties.Any(property => property.Name == nameof(Invoice.DocumentNumber))
                     && index.IsUnique);

        Assert.Contains(
            lineEntity.GetIndexes(),
            index => index.GetDatabaseName() == "IX_InvoiceLines_InvoiceId_Sequence"
                     && index.IsUnique);
    }

    [Fact]
    public async Task MigrateAsync_applies_invoice_schema_on_sqlite()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = new FinanceDbContext(
            new DbContextOptionsBuilder<FinanceDbContext>()
                .UseSqlite(connection)
                .Options);

        await context.Database.MigrateAsync();

        Assert.NotNull(context.Model.FindEntityType(typeof(Invoice)));
        Assert.NotNull(context.Model.FindEntityType(typeof(InvoiceLine)));
        Assert.Contains(
            await context.Database.GetAppliedMigrationsAsync(),
            name => name.Contains("AddInvoices", StringComparison.Ordinal));
    }

    private FinanceDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<FinanceDbContext>()
            .UseSqlite(_connection)
            .Options;
        return new FinanceDbContext(options);
    }

    private async Task<FinanceWorkspaceId> SeedWorkspaceAsync(
        Guid organizationId,
        Guid platformWorkspaceId,
        string name)
    {
        var workspace = FinanceWorkspace.Create(
            FinanceWorkspaceId.New(),
            new PlatformOrganizationId(organizationId),
            new PlatformWorkspaceId(platformWorkspaceId),
            name,
            "UAH",
            T0);

        _dbContext.FinanceWorkspaces.Add(workspace);
        await _dbContext.SaveChangesAsync();
        return workspace.Id;
    }
}
