using Harbourline.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Harbourline.Api.Data;

public sealed class BankDbContext(DbContextOptions<BankDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<Payee> Payees => Set<Payee>();
    public DbSet<Transfer> Transfers => Set<Transfer>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).HasMaxLength(256);
        });

        b.Entity<Account>(e =>
        {
            e.HasIndex(a => a.UserId);
            e.HasIndex(a => a.AccountNumber).IsUnique();
            e.Property(a => a.Type).HasConversion<string>();
            // Optimistic concurrency: an UPDATE only succeeds if the balance is still what we read,
            // so two simultaneous transfers can't both spend the same money.
            e.Property(a => a.BalanceCents).IsConcurrencyToken();
        });

        b.Entity<Transaction>(e =>
        {
            e.HasIndex(t => new { t.AccountId, t.PostedAt });
            e.Property(t => t.Category).HasConversion<string>();
        });

        b.Entity<Payee>().HasIndex(p => p.UserId);

        b.Entity<Transfer>(e =>
        {
            // One result per (user, idempotency key) — enforced by the database, not just code.
            e.HasIndex(t => new { t.UserId, t.IdempotencyKey }).IsUnique();
        });
    }
}
