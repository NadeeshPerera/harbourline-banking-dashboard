using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Harbourline.Api.Common;
using Harbourline.Api.Data;
using Harbourline.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Harbourline.Api.Features.Transfers;

/// <summary>Outcome of a transfer attempt, mapped to HTTP by the endpoint.</summary>
public abstract record TransferOutcome
{
    public sealed record Success(TransferResultDto Result) : TransferOutcome;
    public sealed record Invalid(Dictionary<string, string[]> Errors) : TransferOutcome;
    public sealed record NotFound(string Title) : TransferOutcome;
    public sealed record Rejected(string Title, string Detail) : TransferOutcome;
    public sealed record Conflict(string Title, string Detail) : TransferOutcome;
}

public sealed class TransferService(BankDbContext db, TimeProvider clock)
{
    private const int MaxAttempts = 3;

    public Task<TransferOutcome> CreateAsync(string userId, TransferRequest request, string idempotencyKey, CancellationToken ct) =>
        CreateAsync(userId, request, idempotencyKey, attempt: 1, ct);

    private async Task<TransferOutcome> CreateAsync(string userId, TransferRequest request, string idempotencyKey, int attempt, CancellationToken ct)
    {
        var requestHash = Hash(request);

        // 1. Idempotency: the same key returns the original result instead of paying twice.
        var existing = await db.Transfers.AsNoTracking()
            .SingleOrDefaultAsync(t => t.UserId == userId && t.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null)
        {
            if (existing.RequestHash != requestHash)
                return new TransferOutcome.Conflict("Idempotency key reused", "This Idempotency-Key was already used for a different transfer.");
            var account = await db.Accounts.AsNoTracking().SingleAsync(a => a.Id == existing.FromAccountId, ct);
            return new TransferOutcome.Success(ToResult(existing, account));
        }

        // 2. Input validation.
        var errors = Validate(request);
        if (errors.Count > 0) return new TransferOutcome.Invalid(errors);
        var reference = request.Reference?.Trim() ?? "";

        // 3. Everything below commits or rolls back as one unit.
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var from = await db.Accounts.SingleOrDefaultAsync(a => a.Id == request.FromAccountId && a.UserId == userId, ct);
        if (from is null) return new TransferOutcome.NotFound("Account not found");

        Account? toAccount = null;
        string toName;
        var isExternal = request.To!.Type == "payee";
        if (isExternal)
        {
            var payee = await db.Payees.AsNoTracking().SingleOrDefaultAsync(p => p.Id == request.To.PayeeId && p.UserId == userId, ct);
            if (payee is null) return new TransferOutcome.NotFound("Payee not found");
            toName = payee.Name;
        }
        else
        {
            toAccount = await db.Accounts.SingleOrDefaultAsync(a => a.Id == request.To.AccountId && a.UserId == userId, ct);
            if (toAccount is null) return new TransferOutcome.NotFound("Destination account not found");
            if (toAccount.Id == from.Id)
                return new TransferOutcome.Invalid(new() { ["to"] = ["Choose a different account to transfer to."] });
            toName = toAccount.Name;
        }

        if (request.AmountCents > from.BalanceCents)
            return new TransferOutcome.Rejected("Insufficient funds", "Your available balance is too low for this transfer.");

        var nowUtc = clock.GetUtcNow().UtcDateTime;
        if (isExternal)
        {
            var dayStart = SgTime.StartOfDayUtc(SgTime.Today(clock));
            var ownAccounts = db.Accounts.Where(a => a.UserId == userId).Select(a => a.Id);
            var sentToday = -await db.Transactions
                .Where(t => ownAccounts.Contains(t.AccountId) && t.IsExternal && t.PostedAt >= dayStart)
                .SumAsync(t => t.AmountCents, ct);
            if (sentToday + request.AmountCents > Limits.DailyExternalLimitCents)
            {
                var left = (Limits.DailyExternalLimitCents - sentToday) / 100m;
                return new TransferOutcome.Rejected("Daily limit exceeded",
                    $"Transfers to other people are limited to S${Limits.DailyExternalLimitCents / 100} per day. You have S${left:0.00} left today.");
            }
        }

        var transfer = new Transfer
        {
            Id = $"TRF-{Guid.NewGuid():N}"[..16].ToUpperInvariant(),
            UserId = userId,
            IdempotencyKey = idempotencyKey,
            RequestHash = requestHash,
            FromAccountId = from.Id,
            ToName = toName,
            AmountCents = request.AmountCents,
            Reference = reference,
            CreatedAt = nowUtc,
        };

        Post(from, -request.AmountCents, $"Transfer to {toName}", reference, nowUtc, isExternal, internalTransfer: !isExternal);
        if (toAccount is not null)
            Post(toAccount, request.AmountCents, $"Transfer from {from.Name}", reference, nowUtc, external: false, internalTransfer: true);
        db.Transfers.Add(transfer);

        try
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        catch (DbUpdateException) when (attempt < MaxAttempts)
        {
            // Either a concurrent request with the same key won (unique index), or the balance
            // changed under us (concurrency token). Start again from fresh data: step 1 returns
            // the winner's result, otherwise the balance and limit checks re-run.
            await tx.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            return await CreateAsync(userId, request, idempotencyKey, attempt + 1, ct);
        }

        return new TransferOutcome.Success(ToResult(transfer, from));
    }

    private void Post(Account account, long amountCents, string description, string reference, DateTime atUtc, bool external, bool internalTransfer)
    {
        account.BalanceCents += amountCents;
        db.Transactions.Add(new Transaction
        {
            Id = $"t-{Guid.NewGuid():N}",
            AccountId = account.Id,
            PostedAt = atUtc,
            Description = description,
            Category = Category.Transfer,
            AmountCents = amountCents,
            BalanceAfterCents = account.BalanceCents,
            Reference = string.IsNullOrEmpty(reference) ? null : reference,
            IsExternal = external,
            IsInternalTransfer = internalTransfer,
        });
    }

    private static Dictionary<string, string[]> Validate(TransferRequest r)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(r.FromAccountId)) errors["fromAccountId"] = ["Choose an account to pay from."];
        if (r.AmountCents <= 0) errors["amountCents"] = ["Amount must be greater than zero."];
        if ((r.Reference?.Trim().Length ?? 0) > Limits.MaxReferenceLength)
            errors["reference"] = [$"Reference must be {Limits.MaxReferenceLength} characters or fewer."];
        var to = r.To;
        var validTo = to?.Type switch
        {
            "account" => !string.IsNullOrWhiteSpace(to.AccountId),
            "payee" => !string.IsNullOrWhiteSpace(to.PayeeId),
            _ => false,
        };
        if (!validTo) errors["to"] = ["Choose who to pay."];
        return errors;
    }

    private static string Hash(TransferRequest r) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(r))));

    private static TransferResultDto ToResult(Transfer t, Account from) =>
        new(t.Id, DateTime.SpecifyKind(t.CreatedAt, DateTimeKind.Utc), AccountDto.From(from), t.AmountCents, t.ToName, t.Reference);
}
