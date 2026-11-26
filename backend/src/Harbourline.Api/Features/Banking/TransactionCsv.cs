using System.Globalization;
using System.Text;
using Harbourline.Api.Common;
using Harbourline.Api.Domain;

namespace Harbourline.Api.Features.Banking;

/// <summary>
/// Builds the transactions CSV export (RFC 4180). The frontend demo ledger produces the same
/// bytes (frontend/src/lib/transactionsCsv.ts), so both backends export identical files.
/// </summary>
public static class TransactionCsv
{
    public static readonly string[] Header =
        ["Date (SGT)", "Description", "Reference", "Category", "Account", "Amount (SGD)", "Balance (SGD)"];

    public static string Build(IEnumerable<Transaction> transactions, IReadOnlyDictionary<string, string> accountNames)
    {
        var sb = new StringBuilder();
        AppendRow(sb, Header);
        foreach (var t in transactions)
        {
            AppendRow(sb,
            [
                SgTime.ToLocal(t.PostedAt).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                Text(t.Description),
                Text(t.Reference ?? ""),
                JsonNaming(t.Category),
                Text(accountNames.GetValueOrDefault(t.AccountId, "")),
                FormatCents(t.AmountCents),
                FormatCents(t.BalanceAfterCents),
            ]);
        }
        return sb.ToString();
    }

    public static string FileName(DateOnly today) => $"harbourline-transactions-{today:yyyy-MM-dd}.csv";

    /// <summary>Integer cents to a plain decimal string ("-1234.50") with no floating point.</summary>
    public static string FormatCents(long cents)
    {
        var abs = Math.Abs(cents);
        return string.Create(CultureInfo.InvariantCulture, $"{(cents < 0 ? "-" : "")}{abs / 100}.{abs % 100:D2}");
    }

    /// <summary>Quotes a field when it contains a comma, quote or line break; embedded quotes are doubled.</summary>
    public static string Escape(string field) =>
        field.IndexOfAny([',', '"', '\r', '\n']) >= 0 ? $"\"{field.Replace("\"", "\"\"")}\"" : field;

    /// <summary>
    /// Free text can come from other people (payee names, references). A leading = + - @ (or tab / CR)
    /// would make Excel or Sheets run it as a formula, so prefix it with an apostrophe (OWASP CSV injection).
    /// </summary>
    public static string Text(string value) =>
        value.Length > 0 && "=+-@\t\r".Contains(value[0]) ? "'" + value : value;

    private static string JsonNaming(Category category)
    {
        var name = category.ToString();
        return char.ToLowerInvariant(name[0]) + name[1..];
    }

    private static void AppendRow(StringBuilder sb, IEnumerable<string> fields)
    {
        sb.AppendJoin(',', fields.Select(Escape));
        sb.Append("\r\n");
    }
}
