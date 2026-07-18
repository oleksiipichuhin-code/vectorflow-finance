using VectorFlow.Finance.Application.Health;
using VectorFlow.Finance.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddFinanceInfrastructure();

var app = builder.Build();

app.MapGet("/health", (HealthStatusService health) =>
{
    var status = health.GetStatus();
    return Results.Ok(new
    {
        product = status.Product,
        status = status.Status,
        phase = status.Phase
    });
});

app.Run();

public partial class Program;
