using VectorFlow.Finance.Application.Abstractions;

namespace VectorFlow.Finance.Api.Http;

internal static class ApplicationResultHttp
{
    public static IResult ToHttpResult<T>(ApplicationResult<T> result, int successStatusCode = StatusCodes.Status200OK)
    {
        if (result.IsSuccess)
        {
            return Results.Json(result.Value, statusCode: successStatusCode);
        }

        var payload = new
        {
            error = result.ErrorKind.ToString(),
            message = result.ErrorMessage ?? "Request failed."
        };

        return result.ErrorKind switch
        {
            ApplicationErrorKind.ValidationFailed => Results.Json(payload, statusCode: StatusCodes.Status400BadRequest),
            ApplicationErrorKind.NotFound => Results.Json(payload, statusCode: StatusCodes.Status404NotFound),
            ApplicationErrorKind.Conflict => Results.Json(payload, statusCode: StatusCodes.Status409Conflict),
            _ => Results.Json(
                new
                {
                    error = "InternalServerError",
                    message = "An unexpected error occurred."
                },
                statusCode: StatusCodes.Status500InternalServerError)
        };
    }
}
