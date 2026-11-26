using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Harbourline.Api.Common;
using Harbourline.Api.Domain;
using Harbourline.Api.Features.Banking;

namespace Harbourline.Api.Tests;

public sealed class ApiTests : IAsyncLifetime
{
    private readonly BankApiFactory _factory = new();
    private static readonly JsonSerializerOptions Json = BankApiFactory.Json;

    public Task InitializeAsync() => _factory.SeedAsync();
    public Task DisposeAsync() { _factory.Dispose(); return Task.CompletedTask; }

    private static async Task<T> Read<T>(HttpResponseMessage res) => (await res.Content.ReadFromJsonAsync<T>(Json))!;

    private static Task<HttpResponseMessage> Transfer(HttpClient client, object body, string? key = null)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/api/transfers") { Content = JsonContent.Create(body) };
        req.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString());
        return client.SendAsync(req);
    }

    private static object ToAccount(string from, string to, long cents, string reference = "") =>
        new { fromAccountId = from, to = new { type = "account", accountId = to }, amountCents = cents, reference };

    private static object ToPayee(string from, string payee, long cents, string reference = "") =>
        new { fromAccountId = from, to = new { type = "payee", payeeId = payee }, amountCents = cents, reference };

    private static async Task<long> Balance(HttpClient client, string accountId) =>
        (await client.GetFromJsonAsync<AccountDto[]>("/api/accounts", Json))!.Single(a => a.Id == accountId).BalanceCents;

    // ---------- Auth ----------

    [Fact]
    public async Task Login_with_wrong_password_returns_401_problem()
    {
        var res = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new { email = DemoSeederEmail, password = "nope" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
        Assert.Contains("Invalid credentials", await res.Content.ReadAsStringAsync());
    }

    private const string DemoSeederEmail = Harbourline.Api.Data.DemoSeeder.DemoEmail;

    [Theory]
    [InlineData("/api/me")]
    [InlineData("/api/accounts")]
    [InlineData("/api/transactions")]
    [InlineData("/api/transactions/export")]
    [InlineData("/api/analytics/summary")]
    public async Task Protected_endpoints_require_a_token(string url)
    {
        var res = await _factory.CreateClient().GetAsync(url);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Me_returns_the_signed_in_user_with_email_case_insensitive_login()
    {
        var client = await _factory.SignedInClientAsync(email: "  Alex.Tan@DEMO.harbourline.sg ");
        var me = await client.GetFromJsonAsync<UserDto>("/api/me", Json);
        Assert.Equal("Alex Tan", me!.Name);
    }

    // ---------- Accounts & statements ----------

    [Fact]
    public async Task Account_balances_match_the_latest_statement_line()
    {
        var client = await _factory.SignedInClientAsync();
        var accounts = await client.GetFromJsonAsync<AccountDto[]>("/api/accounts", Json);
        Assert.Equal(3, accounts!.Length);
        Assert.DoesNotContain(accounts, a => a.Id == "b-1"); // never another customer's account

        foreach (var account in accounts)
        {
            var page = await client.GetFromJsonAsync<PageDto<TransactionDto>>($"/api/transactions?accountId={account.Id}&pageSize=1", Json);
            Assert.Equal(account.BalanceCents, page!.Items[0].BalanceAfterCents);
        }
    }

    [Fact]
    public async Task Transactions_filter_search_and_paginate_newest_first()
    {
        var client = await _factory.SignedInClientAsync();
        var p1 = await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?category=dining&pageSize=5", Json);
        var p2 = await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?category=dining&pageSize=5&page=2", Json);

        Assert.Equal(5, p1!.Items.Count);
        Assert.All(p1.Items, t => Assert.Equal(Category.Dining, t.Category));
        Assert.Equal(p1.Items.Select(t => t.PostedAt).OrderByDescending(d => d), p1.Items.Select(t => t.PostedAt));
        Assert.True(p1.Items[^1].PostedAt >= p2!.Items[0].PostedAt);
        Assert.Equal(p1.Total, p2.Total);

        var salary = await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?q=salary", Json);
        Assert.NotEmpty(salary!.Items);
        Assert.All(salary.Items, t => Assert.Equal(Category.Salary, t.Category));

        // Date filters are whole days in Singapore time.
        var october = await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?from=2026-10-01&to=2026-10-31&pageSize=100", Json);
        Assert.All(october!.Items, t => Assert.Equal(10, t.PostedAt.AddHours(8).Month));
    }

    [Fact]
    public async Task Unknown_category_is_a_validation_error()
    {
        var client = await _factory.SignedInClientAsync();
        var res = await client.GetAsync("/api/transactions?category=crypto");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    // ---------- CSV export ----------

    private static async Task<string[]> CsvLines(HttpResponseMessage res)
    {
        var text = await res.Content.ReadAsStringAsync();
        return text.Split("\r\n", StringSplitOptions.RemoveEmptyEntries);
    }

    [Fact]
    public async Task Export_returns_every_filtered_row_as_a_csv_download()
    {
        var client = await _factory.SignedInClientAsync();
        var page = await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?category=dining&pageSize=5", Json);

        var res = await client.GetAsync("/api/transactions/export?category=dining");
        res.EnsureSuccessStatusCode();
        Assert.Equal("text/csv", res.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", res.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal("harbourline-transactions-2026-11-15.csv", res.Content.Headers.ContentDisposition?.FileName);

        var bytes = await res.Content.ReadAsByteArrayAsync();
        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes[..3]); // UTF-8 BOM for Excel

        var lines = await CsvLines(res);
        Assert.Equal("Date (SGT),Description,Reference,Category,Account,Amount (SGD),Balance (SGD)", lines[0].TrimStart('\uFEFF'));
        // All pages, not just the first one.
        Assert.True(page!.Total > 5);
        Assert.Equal(page.Total, lines.Length - 1);
        Assert.All(lines[1..], l => Assert.Contains(",dining,", l));
    }

    [Fact]
    public async Task Export_formats_money_from_cents_and_dates_in_Singapore_time()
    {
        var client = await _factory.SignedInClientAsync();
        var latest = (await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?accountId=a-cur&pageSize=1", Json))!.Items[0];

        var lines = await CsvLines(await client.GetAsync("/api/transactions/export?accountId=a-cur"));
        var expectedDate = latest.PostedAt.AddHours(8).ToString("yyyy-MM-dd HH:mm", System.Globalization.CultureInfo.InvariantCulture);
        Assert.StartsWith(expectedDate + ",", lines[1]);
        Assert.EndsWith($",{TransactionCsv.FormatCents(latest.AmountCents)},{TransactionCsv.FormatCents(latest.BalanceAfterCents)}", lines[1]);
    }

    [Fact]
    public async Task Export_escapes_commas_and_quotes_and_neutralises_formulas()
    {
        var client = await _factory.SignedInClientAsync();
        (await Transfer(client, ToPayee("a-cur", "p-1", 1_050, "Dinner, \"Ah Hock\""))).EnsureSuccessStatusCode();
        (await Transfer(client, ToPayee("a-cur", "p-1", 2_000, "=HYPERLINK(\"x\")"))).EnsureSuccessStatusCode();

        var dinner = await CsvLines(await client.GetAsync("/api/transactions/export?q=Ah%20Hock"));
        Assert.Equal(2, dinner.Length);
        Assert.Contains(",\"Dinner, \"\"Ah Hock\"\"\",transfer,Everyday Current,-10.50,", dinner[1]);

        var formula = await CsvLines(await client.GetAsync("/api/transactions/export?q=HYPERLINK"));
        Assert.Contains(",\"'=HYPERLINK(\"\"x\"\")\",", formula[1]);
    }

    [Fact]
    public async Task Export_only_contains_the_signed_in_customers_transactions_and_validates_filters()
    {
        var other = await _factory.SignedInClientAsync("sam.lee@demo.harbourline.sg", "Other@1234");
        var lines = await CsvLines(await other.GetAsync("/api/transactions/export"));
        Assert.Single(lines); // header only: Sam has no transactions

        var leak = await CsvLines(await other.GetAsync("/api/transactions/export?accountId=a-cur"));
        Assert.Single(leak);

        var bad = await other.GetAsync("/api/transactions/export?category=crypto");
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Theory]
    [InlineData(0L, "0.00")]
    [InlineData(5L, "0.05")]
    [InlineData(123_450L, "1234.50")]
    [InlineData(-29L, "-0.29")]
    [InlineData(-100_000_00L, "-100000.00")]
    public void FormatCents_uses_integer_maths(long cents, string expected) =>
        Assert.Equal(expected, TransactionCsv.FormatCents(cents));

    [Theory]
    [InlineData("plain", "plain")]
    [InlineData("a,b", "\"a,b\"")]
    [InlineData("say \"hi\"", "\"say \"\"hi\"\"\"")]
    [InlineData("two\nlines", "\"two\nlines\"")]
    public void Escape_quotes_fields_only_when_needed(string field, string expected) =>
        Assert.Equal(expected, TransactionCsv.Escape(field));

    // ---------- Transfers ----------

    [Fact]
    public async Task Internal_transfer_moves_money_and_records_both_sides()
    {
        var client = await _factory.SignedInClientAsync();
        var cur = await Balance(client, "a-cur");
        var goal = await Balance(client, "a-goal");

        var res = await Transfer(client, ToAccount("a-cur", "a-goal", 12_345, "Japan trip"));
        res.EnsureSuccessStatusCode();
        var result = await Read<TransferResultDto>(res);

        Assert.Equal("Travel Goal", result.ToName);
        Assert.Equal(cur - 12_345, result.FromAccount.BalanceCents);
        Assert.Equal(cur - 12_345, await Balance(client, "a-cur"));
        Assert.Equal(goal + 12_345, await Balance(client, "a-goal"));
    }

    [Fact]
    public async Task Same_idempotency_key_returns_the_original_result_and_charges_once()
    {
        var client = await _factory.SignedInClientAsync();
        var start = await Balance(client, "a-cur");
        var body = ToPayee("a-cur", "p-1", 5_000);

        var first = await Read<TransferResultDto>(await Transfer(client, body, "key-123"));
        var second = await Read<TransferResultDto>(await Transfer(client, body, "key-123"));

        Assert.Equal(first.TransferId, second.TransferId);
        Assert.Equal(start - 5_000, await Balance(client, "a-cur"));
    }

    [Fact]
    public async Task Reusing_a_key_for_a_different_transfer_is_a_conflict()
    {
        var client = await _factory.SignedInClientAsync();
        (await Transfer(client, ToPayee("a-cur", "p-1", 5_000), "key-x")).EnsureSuccessStatusCode();
        var res = await Transfer(client, ToPayee("a-cur", "p-1", 9_999), "key-x");
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Missing_idempotency_key_is_rejected()
    {
        var client = await _factory.SignedInClientAsync();
        var res = await client.PostAsJsonAsync("/api/transfers", ToPayee("a-cur", "p-1", 100));
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Contains("Idempotency-Key", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Insufficient_funds_is_422()
    {
        var client = await _factory.SignedInClientAsync();
        var goal = await Balance(client, "a-goal");
        var res = await Transfer(client, ToAccount("a-goal", "a-cur", goal + 1));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
        Assert.Contains("Insufficient funds", await res.Content.ReadAsStringAsync());
        Assert.Equal(goal, await Balance(client, "a-goal"));
    }

    [Fact]
    public async Task Daily_third_party_limit_is_enforced_and_resets_the_next_Singapore_day()
    {
        var client = await _factory.SignedInClientAsync();
        (await Transfer(client, ToPayee("a-sav", "p-2", 300_000))).EnsureSuccessStatusCode();
        (await Transfer(client, ToPayee("a-sav", "p-2", 200_000))).EnsureSuccessStatusCode(); // exactly S$5,000

        var over = await Transfer(client, ToPayee("a-sav", "p-2", 1));
        Assert.Equal(HttpStatusCode.UnprocessableEntity, over.StatusCode);
        Assert.Contains("Daily limit exceeded", await over.Content.ReadAsStringAsync());

        // Own-account transfers don't count towards the limit.
        (await Transfer(client, ToAccount("a-sav", "a-cur", 100_000))).EnsureSuccessStatusCode();

        // 12 hours later it's past midnight in Singapore: a new day, a new limit.
        _factory.Clock.Advance(TimeSpan.FromHours(12));

        // The 60-minute session token has expired by now...
        Assert.Equal(HttpStatusCode.Unauthorized, (await Transfer(client, ToPayee("a-sav", "p-2", 1))).StatusCode);

        // ...so sign in again; the daily limit has reset.
        var fresh = await _factory.SignedInClientAsync();
        (await Transfer(fresh, ToPayee("a-sav", "p-2", 1))).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Invalid_input_returns_field_errors()
    {
        var client = await _factory.SignedInClientAsync();
        var res = await Transfer(client, new { fromAccountId = "a-cur", to = new { type = "wire" }, amountCents = 0, reference = new string('x', 36) });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);

        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        var errors = doc.RootElement.GetProperty("errors");
        Assert.True(errors.TryGetProperty("amountCents", out _));
        Assert.True(errors.TryGetProperty("reference", out _));
        Assert.True(errors.TryGetProperty("to", out _));
    }

    [Fact]
    public async Task Customers_cannot_touch_each_others_accounts_or_payees()
    {
        var client = await _factory.SignedInClientAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await Transfer(client, ToAccount("b-1", "a-cur", 100))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Transfer(client, ToAccount("a-cur", "b-1", 100))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Transfer(client, ToPayee("a-cur", "p-sam", 100))).StatusCode);

        var page = await client.GetFromJsonAsync<PageDto<TransactionDto>>("/api/transactions?accountId=b-1", Json);
        Assert.Equal(0, page!.Total);
    }

    // ---------- Analytics ----------

    [Fact]
    public async Task Summary_counts_payments_to_others_but_not_moves_between_own_accounts()
    {
        var client = await _factory.SignedInClientAsync();
        var before = await client.GetFromJsonAsync<SpendingSummaryDto>("/api/analytics/summary?months=6", Json);
        Assert.Equal(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"], before!.Monthly.Select(m => m.Month));
        Assert.DoesNotContain(before.Categories, c => c.Category == Category.Salary);

        (await Transfer(client, ToAccount("a-cur", "a-sav", 50_000))).EnsureSuccessStatusCode();
        var afterInternal = await client.GetFromJsonAsync<SpendingSummaryDto>("/api/analytics/summary?months=6", Json);
        Assert.Equal(before.Monthly[^1], afterInternal!.Monthly[^1]);

        (await Transfer(client, ToPayee("a-cur", "p-1", 7_500))).EnsureSuccessStatusCode();
        var afterExternal = await client.GetFromJsonAsync<SpendingSummaryDto>("/api/analytics/summary?months=6", Json);
        Assert.Equal(before.ThisMonthExpenseCents + 7_500, afterExternal!.ThisMonthExpenseCents);
        Assert.Equal(7_500, afterExternal.Categories.Single(c => c.Category == Category.Transfer).AmountCents);
    }
}
