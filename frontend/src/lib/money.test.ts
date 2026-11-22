import { describe, expect, it } from "vitest";
import { formatCents, formatSignedCents, maskAccountNumber, parseAmountToCents } from "./money";

describe("parseAmountToCents", () => {
  it.each([
    ["120", 12000],
    ["120.5", 12050],
    ["120.05", 12005],
    ["1,234.56", 123456],
    ["S$15", 1500],
    ["$0.10", 10],
    ["  42.00 ", 4200],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "-5", "1e3", "12.3.4", "0x10"])("rejects %j", (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  it("never goes through floating point (0.1 + 0.2 problem)", () => {
    expect(parseAmountToCents("0.29")).toBe(29); // 0.29 * 100 === 28.999999999999996
  });
});

describe("formatting", () => {
  it("formats SGD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatSignedCents(-4250)).toBe("−$42.50");
    expect(formatSignedCents(620000)).toBe("+$6,200.00");
  });

  it("masks account numbers", () => {
    expect(maskAccountNumber("201-34567-8")).toBe("•••• 5678");
  });
});
