using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Harbourline.Api.Common;
using Harbourline.Api.Data;
using Harbourline.Api.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;

namespace Harbourline.Api.Tests;

/// <summary>
/// Boots the real API in memory with an isolated in-memory SQLite database and a fixed clock
/// (15 Nov 2026, 12:00 Singapore time).
/// </summary>
public sealed class BankApiFactory : WebApplicationFactory<Program>
{
    public static readonly DateTimeOffset Now = new(2026, 11, 15, 4, 0, 0, TimeSpan.Zero);
    public FakeTimeProvider Clock { get; } = new(Now);
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Key", "integration-tests-signing-key-at-least-32-bytes");
        builder.UseSetting("Database:SeedOnStartup", "false");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<BankDbContext>>();
            services.AddDbContext<BankDbContext>(o => o.UseSqlite(_connection));
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Clock);
        });
    }

    /// <summary>Creates the schema, seeds the demo customer and a second customer for isolation tests.</summary>
    public async Task SeedAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BankDbContext>();
        await db.Database.EnsureCreatedAsync();
        await DemoSeeder.SeedAsync(db, Clock, seed: 7);

        var other = new User { Id = "u-2", Name = "Sam Lee", Email = "sam.lee@demo.harbourline.sg" };
        other.PasswordHash = new PasswordHasher<User>().HashPassword(other, "Other@1234");
        db.Users.Add(other);
        db.Accounts.Add(new Account { Id = "b-1", UserId = "u-2", Name = "Sam's Savings", Type = AccountType.Savings, AccountNumber = "999-00001-1", BalanceCents = 1_000_000 });
        db.Payees.Add(new Payee { Id = "p-sam", UserId = "u-2", Name = "Sam's Friend", BankName = "Harbourline Bank", AccountNumber = "999-00002-2" });
        await db.SaveChangesAsync();
    }

    public async Task<HttpClient> SignedInClientAsync(string email = DemoSeeder.DemoEmail, string password = DemoSeeder.DemoPassword)
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        res.EnsureSuccessStatusCode();
        var auth = await res.Content.ReadFromJsonAsync<AuthResponse>(Json);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _connection.Dispose();
    }
}
