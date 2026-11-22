using System.Text.Json;
using System.Text.Json.Serialization;
using Harbourline.Api.Data;
using Harbourline.Api.Features.Auth;
using Harbourline.Api.Features.Banking;
using Harbourline.Api.Features.Transfers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// ---------- Configuration ----------
var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();
if (System.Text.Encoding.UTF8.GetByteCount(jwt.Key) < 32)
{
    throw new InvalidOperationException(
        "Jwt:Key must be at least 32 bytes. Set it with `dotnet user-secrets set Jwt:Key <value>` or the Jwt__Key environment variable.");
}
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.Section));

// ---------- Services ----------
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<BankDbContext>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Bank") ?? "Data Source=harbourline.db"));
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<TransferService>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false; // keep "sub", "email", "name" as-is
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = jwt.SigningKey(),
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });
// Validate token lifetimes against the app's TimeProvider (the same clock that issues them),
// so expiry is consistent everywhere and testable with a fake clock.
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<TimeProvider>((o, clock) =>
    {
        var skew = o.TokenValidationParameters.ClockSkew;
        o.TokenValidationParameters.LifetimeValidator = (notBefore, expires, _, _) =>
        {
            var now = clock.GetUtcNow().UtcDateTime;
            return (notBefore is null || notBefore.Value <= now + skew) && expires is not null && expires.Value > now - skew;
        };
    });
builder.Services.AddAuthorization();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

// RFC 7807 problem+json for every error response.
builder.Services.AddProblemDetails();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(allowedOrigins).AllowAnyMethod().WithHeaders("Authorization", "Content-Type", "Idempotency-Key")));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    o.SwaggerDoc("v1", new OpenApiInfo { Title = "Harbourline Bank API", Version = "v1" });
    var bearer = new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
    };
    o.AddSecurityDefinition("Bearer", bearer);
    o.AddSecurityRequirement(new OpenApiSecurityRequirement { [bearer] = [] });
});

var app = builder.Build();

// ---------- Pipeline ----------
app.UseExceptionHandler();
app.UseStatusCodePages();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous().ExcludeFromDescription();
app.MapAuthEndpoints();
app.MapBankingEndpoints();
app.MapTransferEndpoints();

// Demo app: create the schema and seed a fictional customer on startup.
// (A production service would use EF Core migrations; see ROADMAP.md.)
if (app.Configuration.GetValue("Database:SeedOnStartup", true))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<BankDbContext>();
    await db.Database.EnsureCreatedAsync();
    await DemoSeeder.SeedAsync(db, scope.ServiceProvider.GetRequiredService<TimeProvider>());
}

app.Run();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
