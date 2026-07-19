namespace VectorFlow.Finance.Application.Accounts.Commands;

public sealed record CreateAccountCommand(
    Guid FinanceWorkspaceId,
    string Code,
    string Name,
    string Type);

public sealed record RenameAccountCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Name);

public sealed record ChangeAccountCodeCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Code);

public sealed record ChangeAccountTypeCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Type);

public sealed record ArchiveAccountCommand(
    Guid FinanceWorkspaceId,
    Guid Id);
