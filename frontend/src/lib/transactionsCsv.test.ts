import { describe, expect, it } from "vitest";
import {
  buildTransactionsCsv,
  csvText,
  escapeCsvField,
  exportFileName,
  formatCentsPlain,
  formatSgDateTime,
} from "./transactionsCsv";
import type { Transaction } from "./types";

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "t-1",
  accountId: "a-cur",
  postedAt: "2026-11-15T04:00:00.000Z",
  description: "Kopi Corner",
  category: "dining",
  amountCents: -650,
  balanceAfterCents: 1_234_550,
  reference: null,
  ...overrides,
});

describe("escapeCsvField", () => {
  it.each([
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(escapeCsvField(input)).toBe(expected);
  });
});

describe("csvText", () => {
  it.each(["=SUM(A1)", "+65 1234", "-cmd", "@import", "\tx"])("neutralises formula-looking text %j", (value) => {
    expect(csvText(value)).toBe(`'${value}`);
  });

  it("leaves ordinary text alone", () => {
    expect(csvText("Transfer to Mei Ling")).toBe("Transfer to Mei Ling");
  });
});

describe("formatCentsPlain", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [29, "0.29"],
    [123_450, "1234.50"],
    [-29, "-0.29"],
    [-10_000_000, "-100000.00"],
  ])("%i → %s", (cents, expected) => {
    expect(formatCentsPlain(cents)).toBe(expected);
  });
});

describe("dates", () => {
  it("uses Singapore time regardless of the browser's time zone", () => {
    expect(formatSgDateTime("2026-11-15T04:00:00.000Z")).toBe("2026-11-15 12:00");
    // 17:30 UTC is already the next day in Singapore.
    expect(formatSgDateTime("2026-10-31T17:30:00.000Z")).toBe("2026-11-01 01:30");
    expect(exportFileName(new Date("2026-10-31T17:30:00.000Z"))).toBe("harbourline-transactions-2026-11-01.csv");
  });
});

describe("buildTransactionsCsv", () => {
  it("writes a header and one CRLF-terminated row per transaction", () => {
    const csv = buildTransactionsCsv(
      [tx(), tx({ id: "t-2", description: "Transfer to Mei Ling", reference: 'Dinner, "Ah Hock"', category: "transfer", amountCents: 1_050 })],
      { "a-cur": "Everyday Current" },
    );
    expect(csv.split("\r\n")).toEqual([
      "Date (SGT),Description,Reference,Category,Account,Amount (SGD),Balance (SGD)",
      "2026-11-15 12:00,Kopi Corner,,dining,Everyday Current,-6.50,12345.50",
      '2026-11-15 12:00,Transfer to Mei Ling,"Dinner, ""Ah Hock""",transfer,Everyday Current,10.50,12345.50',
      "",
    ]);
  });
});
