namespace VectorFlow.Finance.Application.Accounts;

public sealed record AccountDto(
    Guid Id,
    Guid FinanceWorkspaceId,
    string Code,
    string Name,
    string Type,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? ArchivedAt);
