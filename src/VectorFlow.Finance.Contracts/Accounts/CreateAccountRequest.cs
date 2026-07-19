namespace VectorFlow.Finance.Contracts.Accounts;

public sealed record CreateAccountRequest(
    string Code,
    string Name,
    string Type);
