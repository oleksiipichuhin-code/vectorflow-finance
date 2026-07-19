using Microsoft.EntityFrameworkCore;
using VectorFlow.Finance.Api;
using VectorFlow.Finance.Api.AccountBalances;
using VectorFlow.Finance.Api.Accounts;
using VectorFlow.Finance.Api.JournalEntries;
using VectorFlow.Finance.Api.Ledger;
using VectorFlow.Finance.Api.TrialBalances;
using VectorFlow.Finance.Api.Workspaces;
using VectorFlow.Finance.Application.Health;
using VectorFlow.Finance.Infrastructure;
using VectorFlow.Finance.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddFinanceInfrastructure();
builder.Services.AddFinanceApi();

var app = builder.Build();

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var exception = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;

        if (exception is BadHttpRequestException)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new
            {
                error = "ValidationFailed",
                message = "The request is invalid."
            });
            return;
        }

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new
        {
            error = "InternalServerError",
            message = "An unexpected error occurred."
        });
    });
});

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<FinanceDbContext>();
    dbContext.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapGet("/health", (HealthStatusService health) =>
{
    var status = health.GetStatus();
    return Results.Ok(new
    {
        product = status.Product,
        status = status.Status,
        phase = status.Phase
    });
})
.WithTags("Health")
.WithName("GetHealth");

app.MapFinanceWorkspaceEndpoints();
app.MapAccountEndpoints();
app.MapJournalEntryEndpoints();
app.MapLedgerPostingEndpoints();
app.MapAccountBalanceEndpoints();
app.MapTrialBalanceEndpoints();

app.Run();

public partial class Program;
