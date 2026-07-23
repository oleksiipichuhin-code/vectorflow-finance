using VectorFlow.Finance.Application.Abstractions;
using VectorFlow.Finance.Domain.Accruals;
using VectorFlow.Finance.Domain.Workspaces;

namespace VectorFlow.Finance.Application.Accruals.Handlers;

internal static class AccrualHandlerSupport
{
    public static async Task<ApplicationResult<Accrual>> LoadAsync(
        IAccrualRepository repository,
        Guid financeWorkspaceIdValue,
        Guid idValue,
        CancellationToken cancellationToken)
    {
        FinanceWorkspaceId financeWorkspaceId;
        AccrualId id;

        try
        {
            financeWorkspaceId = new FinanceWorkspaceId(financeWorkspaceIdValue);
            id = new AccrualId(idValue);
        }
        catch (ArgumentException ex)
        {
            return ApplicationResult<Accrual>.ValidationFailed(ex.Message);
        }

        var accrual = await repository.GetByIdAsync(financeWorkspaceId, id, cancellationToken);
        if (accrual is null)
        {
            // Missing accrual and workspace mismatch both map to NotFound.
            return ApplicationResult<Accrual>.NotFound("Accrual was not found.");
        }

        return ApplicationResult<Accrual>.Success(accrual);
    }

    public static bool TryParseAccrualType(string type, out AccrualType accrualType, out string? errorMessage)
    {
        if (string.IsNullOrWhiteSpace(type))
        {
            accrualType = default;
            errorMessage = "Accrual type must not be blank.";
            return false;
        }

        if (!Enum.TryParse(type.Trim(), ignoreCase: true, out accrualType) || !Enum.IsDefined(accrualType))
        {
            accrualType = default;
            errorMessage = $"Accrual type '{type}' is not defined.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    public static ApplicationResult<AccrualDto> FromArgumentException(ArgumentException ex) =>
        ApplicationResult<AccrualDto>.ValidationFailed(ex.Message);

    public static ApplicationResult<AccrualDto> FromInvalidOperationException(InvalidOperationException ex) =>
        ApplicationResult<AccrualDto>.Conflict(ex.Message);

    /// <summary>
    /// Mirrors Domain <c>Accrual.NormalizeDescription</c> (trim; blank and max-length rejected).
    /// </summary>
    public static string NormalizeDescription(string? description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            throw new ArgumentException("Accrual description must not be blank.", nameof(description));
        }

        var normalized = description.Trim();
        if (normalized.Length > Accrual.DescriptionMaxLength)
        {
            throw new ArgumentException(
                $"Accrual description must not exceed {Accrual.DescriptionMaxLength} characters.",
                nameof(description));
        }

        return normalized;
    }
}
