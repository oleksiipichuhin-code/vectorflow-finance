using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Invoices;

public sealed record InvoiceCreated(
    InvoiceId InvoiceId,
    FinanceWorkspaceId FinanceWorkspaceId,
    string DocumentNumber,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record InvoiceIssued(
    InvoiceId InvoiceId,
    FinanceWorkspaceId FinanceWorkspaceId,
    DateTimeOffset OccurredAt) : IDomainEvent;
