namespace Harbourline.Api.Domain;

// All money is stored as long integer cents (SGD). Never use double for money.

public sealed class User
{
    public required string Id { get; init; }
    public required string Name { get; set; }
    public required string Email { get; set; }
    public string PasswordHash { get; set; } = "";
}

public enum AccountType { Savings, Current }

public sealed class Account
{
    public required string Id { get; init; }
    public required string UserId { get; init; }
    public required string Name { get; set; }
    public AccountType Type { get; set; }
    public required string AccountNumber { get; init; }
    public string Currency { get; init; } = "SGD";
    public long BalanceCents { get; set; }
}

public enum Category
{
    Salary, Transfer, Housing, Utilities, Groceries, Dining, Transport, Shopping, Entertainment, Health, Other,
}

public sealed class Transaction
{
    public required string Id { get; init; }
    public required string AccountId { get; init; }
    /// <summary>UTC.</summary>
    public DateTime PostedAt { get; init; }
    public required string Description { get; init; }
    public Category Category { get; init; }
    /// <summary>Signed: negative = money out.</summary>
    public long AmountCents { get; init; }
    public long BalanceAfterCents { get; init; }
    public string? Reference { get; init; }
    /// <summary>True for money sent to third-party payees (counts towards the daily limit).</summary>
    public bool IsExternal { get; init; }
    /// <summary>True for movements between the customer's own accounts (excluded from analytics).</summary>
    public bool IsInternalTransfer { get; init; }
}

public sealed class Payee
{
    public required string Id { get; init; }
    public required string UserId { get; init; }
    public required string Name { get; set; }
    public required string BankName { get; set; }
    public required string AccountNumber { get; set; }
}

/// <summary>A completed transfer, keyed by the client's Idempotency-Key so retries can't pay twice.</summary>
public sealed class Transfer
{
    public required string Id { get; init; }
    public required string UserId { get; init; }
    public required string IdempotencyKey { get; init; }
    /// <summary>Fingerprint of the request body; a reused key with a different body is rejected.</summary>
    public required string RequestHash { get; init; }
    public required string FromAccountId { get; init; }
    public required string ToName { get; init; }
    public long AmountCents { get; init; }
    public string Reference { get; init; } = "";
    public DateTime CreatedAt { get; init; }
}
