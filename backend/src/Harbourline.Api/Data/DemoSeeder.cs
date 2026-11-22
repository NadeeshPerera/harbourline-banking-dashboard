using Harbourline.Api.Common;
using Harbourline.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Harbourline.Api.Data;

/// <summary>
/// Seeds a fictional customer with ~6 months of realistic activity ending "now".
/// Deterministic for a given seed. Harbourline Bank and all data are fictional.
/// </summary>
public static class DemoSeeder
{
    public const string DemoEmail = "alex.tan@demo.harbourline.sg";
    public const string DemoPassword = "Demo@1234";

    private static readonly Dictionary<Category, string[]> Merchants = new()
    {
        [Category.Groceries] = ["Neighbourhood Supermarket", "Wet Market Produce", "Online Grocery Delivery"],
        [Category.Dining] = ["Hawker Centre", "Kopitiam", "Bubble Tea Shop", "Food Delivery", "Café Brunch"],
        [Category.Transport] = ["MRT / Bus Fare", "Ride-hail Trip", "Petrol Station"],
        [Category.Shopping] = ["Online Marketplace", "Electronics Store", "Department Store", "Bookshop"],
        [Category.Entertainment] = ["Cinema", "Music Streaming", "Video Streaming", "Badminton Court Booking"],
        [Category.Health] = ["GP Clinic", "Pharmacy", "Dental Clinic"],
    };

    public static async Task SeedAsync(BankDbContext db, TimeProvider clock, int seed = 42, CancellationToken ct = default)
    {
        if (await db.Users.AnyAsync(ct)) return;

        var user = new User { Id = "u-1", Name = "Alex Tan", Email = DemoEmail };
        user.PasswordHash = new PasswordHasher<User>().HashPassword(user, DemoPassword);

        var accounts = new[]
        {
            new Account { Id = "a-cur", UserId = user.Id, Name = "Everyday Current", Type = AccountType.Current, AccountNumber = "201-34567-8", BalanceCents = 1_200_000 },
            new Account { Id = "a-sav", UserId = user.Id, Name = "Bonus Saver", Type = AccountType.Savings, AccountNumber = "201-90412-6", BalanceCents = 2_150_000 },
            new Account { Id = "a-goal", UserId = user.Id, Name = "Travel Goal", Type = AccountType.Savings, AccountNumber = "201-77153-2", BalanceCents = 180_000 },
        };
        var payees = new[]
        {
            new Payee { Id = "p-1", UserId = user.Id, Name = "Mei Ling Wong", BankName = "Harbourline Bank", AccountNumber = "204-55821-3" },
            new Payee { Id = "p-2", UserId = user.Id, Name = "Rajesh Kumar", BankName = "Coastal Savings Bank", AccountNumber = "018-662417-0" },
            new Payee { Id = "p-3", UserId = user.Id, Name = "Sunrise Property Mgmt", BankName = "Strait Commerce Bank", AccountNumber = "731-20094-8" },
        };

        var rng = new Random(seed);
        var nowUtc = clock.GetUtcNow().UtcDateTime;
        var nowLocal = SgTime.ToLocal(nowUtc);
        var drafts = new List<(string AccountId, DateTime Local, string Description, Category Category, long Amount, string? Reference, bool Internal)>();

        void Add(string accountId, DateTime local, string description, Category category, long amount, string? reference = null, bool isInternal = false)
        {
            if (local <= nowLocal) drafts.Add((accountId, local, description, category, amount, reference, isInternal));
        }
        DateTime At(int y, int m, int d, int h = 10) => new(y, m, d, h, rng.Next(0, 60), 0);

        for (var back = 5; back >= 0; back--)
        {
            var month = new DateTime(nowLocal.Year, nowLocal.Month, 1).AddMonths(-back);
            int y = month.Year, m = month.Month, days = DateTime.DaysInMonth(y, m);

            Add("a-cur", At(y, m, 1, 9), "Rent — Sunrise Property Mgmt", Category.Housing, -240_000, "RENT");
            Add("a-cur", At(y, m, 5), "Electricity & Water", Category.Utilities, -rng.Next(9_000, 16_001));
            Add("a-cur", At(y, m, 8), "Mobile & Broadband Plan", Category.Utilities, -6_490);
            Add("a-cur", At(y, m, 25, 8), "Salary — Peerline Tech Pte Ltd", Category.Salary, 620_000, "SALARY");
            Add("a-cur", At(y, m, 26), "Transfer to Travel Goal", Category.Transfer, -50_000, "SAVINGS", true);
            Add("a-goal", At(y, m, 26), "Transfer from Everyday Current", Category.Transfer, 50_000, "SAVINGS", true);
            Add("a-cur", At(y, m, 26), "Transfer to Bonus Saver", Category.Transfer, -100_000, "SAVINGS", true);
            Add("a-sav", At(y, m, 26), "Transfer from Everyday Current", Category.Transfer, 100_000, "SAVINGS", true);
            Add("a-sav", At(y, m, days, 23), "Bonus Interest", Category.Other, rng.Next(3_000, 5_501));

            (Category Cat, int Count, int Min, int Max)[] spend =
            [
                (Category.Groceries, rng.Next(5, 8), 2_500, 16_000),
                (Category.Dining, rng.Next(12, 19), 450, 6_500),
                (Category.Transport, rng.Next(15, 23), 120, 2_800),
                (Category.Shopping, rng.Next(2, 6), 1_500, 25_000),
                (Category.Entertainment, rng.Next(2, 5), 990, 4_500),
                (Category.Health, rng.Next(0, 3), 2_000, 9_000),
            ];
            foreach (var (cat, count, min, max) in spend)
            {
                for (var i = 0; i < count; i++)
                {
                    var names = Merchants[cat];
                    Add("a-cur", At(y, m, rng.Next(1, days + 1), rng.Next(8, 22)), names[rng.Next(names.Length)], cat, -rng.Next(min, max + 1));
                }
            }
        }

        var balances = accounts.ToDictionary(a => a.Id, a => a.BalanceCents);
        var n = 0;
        foreach (var d in drafts.OrderBy(d => d.Local))
        {
            balances[d.AccountId] += d.Amount;
            db.Transactions.Add(new Transaction
            {
                Id = $"t-{++n:D5}",
                AccountId = d.AccountId,
                PostedAt = d.Local - SgTime.Offset,
                Description = d.Description,
                Category = d.Category,
                AmountCents = d.Amount,
                BalanceAfterCents = balances[d.AccountId],
                Reference = d.Reference,
                IsInternalTransfer = d.Internal,
            });
        }
        foreach (var a in accounts) a.BalanceCents = balances[a.Id];

        db.Users.Add(user);
        db.Accounts.AddRange(accounts);
        db.Payees.AddRange(payees);
        await db.SaveChangesAsync(ct);
    }
}
