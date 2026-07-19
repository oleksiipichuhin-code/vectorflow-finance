using VectorFlow.Finance.Domain.Accounts;

namespace VectorFlow.Finance.Application.Accounts;

internal static class AccountMapper
{
    public static AccountDto ToDto(Account account) =>
        new(
            account.Id.Value,
            account.FinanceWorkspaceId.Value,
            account.Code.Value,
            account.Name,
            account.Type.ToString(),
            account.Status.ToString(),
            account.CreatedAt,
            account.UpdatedAt,
            account.ArchivedAt);
}
