using System.Security.Claims;
using Harbourline.Api.Common;
using Harbourline.Api.Features.Auth;
using Microsoft.AspNetCore.Mvc;

namespace Harbourline.Api.Features.Transfers;

public static class TransferEndpoints
{
    public static void MapTransferEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/transfers", async (
            [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
            TransferRequest body, ClaimsPrincipal user, TransferService transfers, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Length > 100)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["Idempotency-Key"] = ["Send a unique Idempotency-Key header (max 100 characters) with every transfer."],
                });
            }

            return await transfers.CreateAsync(user.UserId(), body, idempotencyKey, ct) switch
            {
                TransferOutcome.Success s => Results.Ok(s.Result),
                TransferOutcome.Invalid i => Results.ValidationProblem(i.Errors),
                TransferOutcome.NotFound n => Results.Problem(title: n.Title, statusCode: StatusCodes.Status404NotFound),
                TransferOutcome.Rejected r => Results.Problem(title: r.Title, detail: r.Detail, statusCode: StatusCodes.Status422UnprocessableEntity),
                TransferOutcome.Conflict c => Results.Problem(title: c.Title, detail: c.Detail, statusCode: StatusCodes.Status409Conflict),
                _ => Results.Problem(statusCode: 500),
            };
        })
        .RequireAuthorization()
        .WithTags("Transfers");
    }
}
