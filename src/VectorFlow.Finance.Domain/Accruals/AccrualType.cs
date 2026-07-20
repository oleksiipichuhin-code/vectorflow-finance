namespace VectorFlow.Finance.Domain.Accruals;

/// <summary>
/// MVP classification for an accrual recognition document.
/// </summary>
/// <remarks>
/// Tax, payroll, depreciation, prepaid, deferred revenue, and custom types are deferred.
/// </remarks>
public enum AccrualType
{
    Revenue = 1,
    Expense = 2
}
