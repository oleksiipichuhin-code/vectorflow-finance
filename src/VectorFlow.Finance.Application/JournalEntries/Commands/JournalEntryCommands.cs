namespace VectorFlow.Finance.Application.JournalEntries.Commands;

public sealed record CreateJournalEntryCommand(
    Guid FinanceWorkspaceId,
    string Name);

public sealed record RenameJournalEntryCommand(
    Guid FinanceWorkspaceId,
    Guid Id,
    string Name);

public sealed record AddJournalEntryLineCommand(
    Guid FinanceWorkspaceId,
    Guid JournalEntryId,
    Guid FinancialAccountId,
    decimal Debit,
    decimal Credit,
    string? Description);

public sealed record UpdateJournalEntryLineCommand(
    Guid FinanceWorkspaceId,
    Guid JournalEntryId,
    Guid LineId,
    Guid FinancialAccountId,
    decimal Debit,
    decimal Credit,
    string? Description);

public sealed record RemoveJournalEntryLineCommand(
    Guid FinanceWorkspaceId,
    Guid JournalEntryId,
    Guid LineId);

public sealed record PostJournalEntryCommand(
    Guid FinanceWorkspaceId,
    Guid Id);
