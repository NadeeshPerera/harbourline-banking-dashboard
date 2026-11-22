namespace Harbourline.Api.Common;

/// <summary>
/// Singapore is UTC+8 all year (no daylight saving), so a fixed offset is exact and
/// avoids depending on OS time-zone names (which differ between Windows and Linux).
/// "Today", day filters and monthly buckets are all in Singapore time.
/// </summary>
public static class SgTime
{
    public static readonly TimeSpan Offset = TimeSpan.FromHours(8);

    public static DateTime ToLocal(DateTime utc) => utc + Offset;

    public static DateTime StartOfDayUtc(DateOnly day) => day.ToDateTime(TimeOnly.MinValue) - Offset;

    public static DateOnly Today(TimeProvider clock) => DateOnly.FromDateTime(ToLocal(clock.GetUtcNow().UtcDateTime));

    public static string MonthKey(DateTime utc) => ToLocal(utc).ToString("yyyy-MM");
}
