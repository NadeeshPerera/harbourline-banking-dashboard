using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Harbourline.Api.Common;
using Harbourline.Api.Data;
using Harbourline.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Harbourline.Api.Features.Auth;

public sealed class JwtOptions
{
    public const string Section = "Jwt";
    public string Issuer { get; set; } = "harbourline-api";
    public string Audience { get; set; } = "harbourline-web";
    /// <summary>HMAC signing key, at least 32 bytes. Supply via configuration/secrets, never source control.</summary>
    public string Key { get; set; } = "";
    public int LifetimeMinutes { get; set; } = 60;

    public SymmetricSecurityKey SigningKey() => new(Encoding.UTF8.GetBytes(Key));
}

public sealed class TokenService(IOptions<JwtOptions> options, TimeProvider clock)
{
    public string Issue(User user)
    {
        var o = options.Value;
        var now = clock.GetUtcNow().UtcDateTime;
        var token = new JwtSecurityToken(
            issuer: o.Issuer,
            audience: o.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.Name, user.Name),
            ],
            notBefore: now,
            expires: now.AddMinutes(o.LifetimeMinutes),
            signingCredentials: new SigningCredentials(o.SigningKey(), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public static class AuthEndpoints
{
    public static string UserId(this ClaimsPrincipal user) =>
        user.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? throw new InvalidOperationException("No subject claim");

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", async (LoginRequest body, BankDbContext db, TokenService tokens, CancellationToken ct) =>
        {
            var email = body.Email?.Trim().ToLowerInvariant() ?? "";
            var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email, ct);

            // Same response for unknown email and wrong password: don't reveal which accounts exist.
            if (user is null || body.Password is null ||
                new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, body.Password) == PasswordVerificationResult.Failed)
            {
                return Results.Problem(title: "Invalid credentials", detail: "Email or password is incorrect.", statusCode: 401);
            }
            return Results.Ok(new AuthResponse(tokens.Issue(user), new UserDto(user.Id, user.Name, user.Email)));
        })
        .AllowAnonymous()
        .WithTags("Auth");

        app.MapGet("/api/me", async (ClaimsPrincipal principal, BankDbContext db, CancellationToken ct) =>
        {
            var user = await db.Users.FindAsync([principal.UserId()], ct);
            return user is null ? Results.Unauthorized() : Results.Ok(new UserDto(user.Id, user.Name, user.Email));
        })
        .RequireAuthorization()
        .WithTags("Auth");
    }
}
