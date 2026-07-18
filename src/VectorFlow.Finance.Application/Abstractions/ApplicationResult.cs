namespace VectorFlow.Finance.Application.Abstractions;

public enum ApplicationErrorKind
{
    None = 0,
    ValidationFailed = 1,
    Conflict = 2,
    NotFound = 3
}

public sealed class ApplicationResult<T>
{
    private ApplicationResult(bool isSuccess, ApplicationErrorKind errorKind, string? errorMessage, T? value)
    {
        IsSuccess = isSuccess;
        ErrorKind = errorKind;
        ErrorMessage = errorMessage;
        Value = value;
    }

    public bool IsSuccess { get; }

    public ApplicationErrorKind ErrorKind { get; }

    public string? ErrorMessage { get; }

    public T? Value { get; }

    public static ApplicationResult<T> Success(T value) =>
        new(true, ApplicationErrorKind.None, null, value);

    public static ApplicationResult<T> ValidationFailed(string message) =>
        new(false, ApplicationErrorKind.ValidationFailed, message, default);

    public static ApplicationResult<T> Conflict(string message) =>
        new(false, ApplicationErrorKind.Conflict, message, default);

    public static ApplicationResult<T> NotFound(string message) =>
        new(false, ApplicationErrorKind.NotFound, message, default);

    public static ApplicationResult<T> FromFailure<TOther>(ApplicationResult<TOther> failure)
    {
        if (failure.IsSuccess)
        {
            throw new InvalidOperationException("Cannot project a successful result as a failure.");
        }

        return failure.ErrorKind switch
        {
            ApplicationErrorKind.ValidationFailed => ValidationFailed(failure.ErrorMessage ?? "Validation failed."),
            ApplicationErrorKind.Conflict => Conflict(failure.ErrorMessage ?? "Conflict."),
            ApplicationErrorKind.NotFound => NotFound(failure.ErrorMessage ?? "Not found."),
            _ => throw new InvalidOperationException($"Unsupported error kind '{failure.ErrorKind}'.")
        };
    }
}
