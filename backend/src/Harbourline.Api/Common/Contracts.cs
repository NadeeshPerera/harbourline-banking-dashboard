using Harbourline.Api.Domain;

namespace Harbourline.Api.Common;

// Request/response shapes. These match frontend/src/lib/types.ts exactly
// (camelCase JSON, enums as camelCase strings).

public sealed record UserDto(string Id, string Name, string Email);

public sealed record LoginRequest(string? Email, string? Password);

public sealed record AuthResponse(string Token, UserDto User);

public sealed record AccountDto(string Id, string Name, AccountType Type, string AccountNumber, string Currency, long BalanceCents)
{
    public static AccountDto From(Account a) => new(a.Id, a.Name, a.Type, a.AccountNumber, a.Currency, a.BalanceCents);
}

public sealed record TransactionDto(
    string Id, string AccountId, DateTime PostedAt, string Description, Category Category,
    long AmountCents, long BalanceAfterCents, string? Reference)
{
    public static TransactionDto From(Transaction t) =>
        new(t.Id, t.AccountId, DateTime.SpecifyKind(t.PostedAt, DateTimeKind.Utc), t.Description, t.Category,
            t.AmountCents, t.BalanceAfterCents, t.Reference);
}

public sealed record PageDto<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public sealed record PayeeDto(string Id, string Name, string BankName, string AccountNumber)
{
    public static PayeeDto From(Payee p) => new(p.Id, p.Name, p.BankName, p.AccountNumber);
}

public sealed record MonthlyCashflowDto(string Month, long IncomeCents, long ExpenseCents);

public sealed record CategorySpendDto(Category Category, long AmountCents);

public sealed record SpendingSummaryDto(
    IReadOnlyList<MonthlyCashflowDto> Monthly,
    IReadOnlyList<CategorySpendDto> Categories,
    long ThisMonthExpenseCents,
    long LastMonthExpenseCents);

/// <summary>{ "type": "account", "accountId": "..." } or { "type": "payee", "payeeId": "..." }</summary>
public sealed record TransferDestination(string? Type, string? AccountId, string? PayeeId);

public sealed record TransferRequest(string? FromAccountId, TransferDestination? To, long AmountCents, string? Reference);

public sealed record TransferResultDto(
    string TransferId, DateTime CreatedAt, AccountDto FromAccount, long AmountCents, string ToName, string Reference);

public static class Limits
{
    public const long DailyExternalLimitCents = 500_000; // S$5,000
    public const int MaxReferenceLength = 35;
}
