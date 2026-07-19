using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Domain.Accounts;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accounts.Handlers;

internal static class AccountHandlerSupport
{
    public static async Task<ApplicationResult<Account>> LoadAsync(
        IAccountRepository repository,
        Guid financeWorkspaceIdValue,
        Guid idValue,
        CancellationToken cancellationToken)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccountId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(financeWorkspaceIdValue);
            id = new AccountId(idValue);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<Account>.ValidationFailed(ex.Message);
        }

        var account = await repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (account is null)
        {
            // Missing account and workspace mismatch both map to NotFound.
            return ApplicationResult<Account>.NotFound("Account was not found.");
        }

        return ApplicationResult<Account>.Success(account);
    }

    public static bool TryParseAccountType(string type, out AccountType accountType, out string? errorMessage)
    {
        if (string.IsNullOrWhiteSpace(type))
        {
            accountType = default;
            errorMessage = "Account type must not be blank.";
            return false;
        }

        if (!Enum.TryParse(type.Trim(), ignoreCase: true, out accountType) || !Enum.IsDefined(accountType))
        {
            accountType = default;
            errorMessage = $"Account type '{type}' is not defined.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    public static ApplicationResult<AccountDto> FromArgumentException(ArgumentException ex) =>
        ApplicationResult<AccountDto>.ValidationFailed(ex.Message);

    public static ApplicationResult<AccountDto> FromInvalidOperationException(InvalidOperationException ex) =>
        ApplicationResult<AccountDto>.Conflict(ex.Message);
}
