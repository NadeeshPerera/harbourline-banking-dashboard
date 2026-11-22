using System.Security.Claims;
using Harbourline.Api.Common;
using Harbourline.Api.Data;
using Harbourline.Api.Domain;
using Harbourline.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;

namespace Harbourline.Api.Features.Banking;

public static class BankingEndpoints
{
    public static void MapBankingEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization().WithTags("Banking");

        api.MapGet("/accounts", async (ClaimsPrincipal user, BankDbContext db, CancellationToken ct) =>
        {
            var accounts = await db.Accounts.AsNoTracking()
                .Where(a => a.UserId == user.UserId())
                .OrderBy(a => a.Type).ThenBy(a => a.Name)
                .ToListAsync(ct);
            return accounts.Select(AccountDto.From);
        });

        api.MapGet("/payees", async (ClaimsPrincipal user, BankDbContext db, CancellationToken ct) =>
        {
            var payees = await db.Payees.AsNoTracking().Where(p => p.UserId == user.UserId()).OrderBy(p => p.Name).ToListAsync(ct);
            return payees.Select(PayeeDto.From);
        });

        api.MapGet("/transactions", async (
            ClaimsPrincipal user, BankDbContext db, CancellationToken ct,
            string? accountId, string? category, DateOnly? from, DateOnly? to, string? q, int page = 1, int pageSize = 20) =>
        {
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            // Only ever query the signed-in customer's accounts.
            var ownAccounts = db.Accounts.Where(a => a.UserId == user.UserId()).Select(a => a.Id);
            var query = db.Transactions.AsNoTracking().Where(t => ownAccounts.Contains(t.AccountId));

            if (!string.IsNullOrEmpty(accountId)) query = query.Where(t => t.AccountId == accountId);
            if (!string.IsNullOrEmpty(category))
            {
                if (!Enum.TryParse<Category>(category, ignoreCase: true, out var cat))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["category"] = [$"Unknown category '{category}'."] });
                query = query.Where(t => t.Category == cat);
            }
            if (from is { } f) { var start = SgTime.StartOfDayUtc(f); query = query.Where(t => t.PostedAt >= start); }
            if (to is { } tDay) { var end = SgTime.StartOfDayUtc(tDay.AddDays(1)); query = query.Where(t => t.PostedAt < end); }
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = $"%{q.Trim()}%";
                query = query.Where(t => EF.Functions.Like(t.Description, term) || (t.Reference != null && EF.Functions.Like(t.Reference, term)));
            }

            var total = await query.CountAsync(ct);
            var items = await query
                .OrderByDescending(t => t.PostedAt).ThenByDescending(t => t.Id)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToListAsync(ct);

            return Results.Ok(new PageDto<TransactionDto>(items.Select(TransactionDto.From).ToList(), page, pageSize, total));
        });

        api.MapGet("/analytics/summary", async (ClaimsPrincipal user, BankDbContext db, TimeProvider clock, CancellationToken ct, int months = 6) =>
        {
            months = Math.Clamp(months, 1, 24);
            var nowLocal = SgTime.ToLocal(clock.GetUtcNow().UtcDateTime);
            var firstMonth = new DateTime(nowLocal.Year, nowLocal.Month, 1).AddMonths(-(months - 1));
            var keys = Enumerable.Range(0, months).Select(i => firstMonth.AddMonths(i).ToString("yyyy-MM")).ToList();
            var thisMonth = keys[^1];
            var lastMonth = new DateTime(nowLocal.Year, nowLocal.Month, 1).AddMonths(-1).ToString("yyyy-MM");
            // One extra month back so "last month" is available even when months == 1.
            var sinceUtc = firstMonth.AddMonths(-1) - SgTime.Offset;

            var ownAccounts = db.Accounts.Where(a => a.UserId == user.UserId()).Select(a => a.Id);
            // Moving money between your own accounts is neither income nor spending.
            var rows = await db.Transactions.AsNoTracking()
                .Where(t => ownAccounts.Contains(t.AccountId) && !t.IsInternalTransfer && t.PostedAt >= sinceUtc)
                .Select(t => new { t.PostedAt, t.AmountCents, t.Category })
                .ToListAsync(ct);

            var monthly = keys.ToDictionary(k => k, k => (Income: 0L, Expense: 0L));
            var byCategory = new Dictionary<Category, long>();
            long lastMonthExpense = 0;

            foreach (var r in rows)
            {
                var key = SgTime.MonthKey(r.PostedAt);
                if (r.AmountCents > 0)
                {
                    if (monthly.TryGetValue(key, out var mi)) monthly[key] = (mi.Income + r.AmountCents, mi.Expense);
                    continue;
                }
                var spend = -r.AmountCents;
                if (monthly.TryGetValue(key, out var me)) monthly[key] = (me.Income, me.Expense + spend);
                if (key == lastMonth) lastMonthExpense += spend;
                if (key == thisMonth) byCategory[r.Category] = byCategory.GetValueOrDefault(r.Category) + spend;
            }

            return new SpendingSummaryDto(
                keys.Select(k => new MonthlyCashflowDto(k, monthly[k].Income, monthly[k].Expense)).ToList(),
                byCategory.OrderByDescending(kv => kv.Value).Select(kv => new CategorySpendDto(kv.Key, kv.Value)).ToList(),
                monthly[thisMonth].Expense,
                lastMonthExpense);
        });
    }
}
