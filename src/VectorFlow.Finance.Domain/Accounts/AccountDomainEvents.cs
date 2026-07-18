using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Domain.Accounts;

public sealed record AccountCreated(
    AccountId AccountId,
    FinanceWorkspaceId FinanceWorkspaceId,
    string Code,
    string Name,
    AccountType Type,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccountRenamed(
    AccountId AccountId,
    string Name,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccountCodeChanged(
    AccountId AccountId,
    string Code,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccountTypeChanged(
    AccountId AccountId,
    AccountType Type,
    DateTimeOffset OccurredAt) : IDomainEvent;

public sealed record AccountArchived(
    AccountId AccountId,
    DateTimeOffset OccurredAt) : IDomainEvent;
