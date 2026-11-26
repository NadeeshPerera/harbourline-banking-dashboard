import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { HttpBankApi, filenameFrom } from "./http";

describe("filenameFrom", () => {
  it("prefers the RFC 5987 filename* form", () => {
    expect(filenameFrom(`attachment; filename=a.csv; filename*=UTF-8''harbourline%20export.csv`)).toBe("harbourline export.csv");
  });

  it("reads a plain or quoted filename", () => {
    expect(filenameFrom("attachment; filename=harbourline-transactions-2026-11-15.csv")).toBe("harbourline-transactions-2026-11-15.csv");
    expect(filenameFrom('attachment; filename="statement.csv"')).toBe("statement.csv");
  });

  it("falls back when the header is missing (e.g. not exposed by CORS)", () => {
    expect(filenameFrom(null)).toBe("transactions.csv");
  });
});

describe("HttpBankApi.exportTransactions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only the set filters with the bearer token and returns the file", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Date (SGT)\r\n", {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=harbourline-transactions-2026-11-15.csv" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = new HttpBankApi("http://api.test/", () => "jwt");
    const file = await api.exportTransactions({ category: "dining", q: "", from: "2026-11-01" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/transactions/export?category=dining&from=2026-11-01");
    expect(init.headers).toMatchObject({ Accept: "text/csv", Authorization: "Bearer jwt" });
    expect(file.filename).toBe("harbourline-transactions-2026-11-15.csv");
    expect(await file.blob.text()).toBe("Date (SGT)\r\n");
  });

  it("turns problem+json errors into ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ title: "Validation failed", detail: "Unknown category" }, { status: 400 })),
    );
    const api = new HttpBankApi("http://api.test", () => "jwt");
    await expect(api.exportTransactions({})).rejects.toBeInstanceOf(ApiError);
  });
});
