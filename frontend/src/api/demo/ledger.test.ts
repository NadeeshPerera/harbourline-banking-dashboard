import { describe, expect, it } from "vitest";
import { ApiError } from "../client";
import { Ledger } from "./ledger";
import { DEMO_PAYEES, buildSeed } from "./seed";

const NOW = new Date(2026, 10, 15, 12, 0); // 15 Nov 2026

function makeLedger() {
  const { accounts, transactions } = buildSeed(NOW, 7);
  return new Ledger(accounts, transactions, DEMO_PAYEES, () => NOW);
}

const balance = (ledger: Ledger, id: string) => ledger.getAccounts().find((a) => a.id === id)!.balanceCents;

function expectApiError(fn: () => unknown, status: number, title: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status, title });
    return;
  }
  throw new Error("expected an ApiError");
}

describe("seed", () => {
  it("is deterministic and internally consistent", () => {
    const a = buildSeed(NOW, 7);
    expect(buildSeed(NOW, 7)).toEqual(a);

    // Every account's balance equals the latest running balance on its statement.
    for (const account of a.accounts) {
      const latest = a.transactions.find((t) => t.accountId === account.id);
      expect(latest?.balanceAfterCents).toBe(account.balanceCents);
    }
    // Nothing is dated in the future.
    expect(a.transactions.every((t) => new Date(t.postedAt) <= NOW)).toBe(true);
  });
});

describe("transfers", () => {
  it("moves money between own accounts and records both sides", () => {
    const ledger = makeLedger();
    const before = { cur: balance(ledger, "a-cur"), goal: balance(ledger, "a-goal") };

    const result = ledger.createTransfer(
      { fromAccountId: "a-cur", to: { type: "account", accountId: "a-goal" }, amountCents: 12_345, reference: "Japan trip" },
      "key-1",
    );

    expect(result).toMatchObject({ amountCents: 12_345, toName: "Travel Goal", reference: "Japan trip" });
    expect(balance(ledger, "a-cur")).toBe(before.cur - 12_345);
    expect(balance(ledger, "a-goal")).toBe(before.goal + 12_345);
    const [credit, debit] = ledger.getTransactions({ pageSize: 2 }).items;
    expect([credit.amountCents, debit.amountCents].sort()).toEqual([-12_345, 12_345].sort());
  });

  it("is idempotent: replaying the same key does not pay twice", () => {
    const ledger = makeLedger();
    const start = balance(ledger, "a-cur");
    const req = { fromAccountId: "a-cur", to: { type: "payee" as const, payeeId: "p-1" }, amountCents: 5_000, reference: "" };

    const first = ledger.createTransfer(req, "same-key");
    const second = ledger.createTransfer(req, "same-key");

    expect(second).toEqual(first);
    expect(balance(ledger, "a-cur")).toBe(start - 5_000);
  });

  it("rejects transfers above the available balance", () => {
    const ledger = makeLedger();
    const tooMuch = balance(ledger, "a-goal") + 1;
    expectApiError(
      () => ledger.createTransfer({ fromAccountId: "a-goal", to: { type: "account", accountId: "a-cur" }, amountCents: tooMuch, reference: "" }, "k"),
      422,
      "Insufficient funds",
    );
  });

  it("enforces the S$5,000 daily limit to third parties, but not between own accounts", () => {
    const ledger = makeLedger();
    const pay = (cents: number, key: string) =>
      ledger.createTransfer({ fromAccountId: "a-sav", to: { type: "payee", payeeId: "p-2" }, amountCents: cents, reference: "" }, key);

    pay(300_000, "a");
    pay(200_000, "b"); // exactly at the limit
    expectApiError(() => pay(1, "c"), 422, "Daily limit exceeded");

    // Own-account transfers are still allowed.
    expect(() =>
      ledger.createTransfer({ fromAccountId: "a-sav", to: { type: "account", accountId: "a-cur" }, amountCents: 100_000, reference: "" }, "d"),
    ).not.toThrow();
  });

  it("validates amount, reference and destination", () => {
    const ledger = makeLedger();
    const base = { fromAccountId: "a-cur", to: { type: "account" as const, accountId: "a-sav" }, reference: "" };
    expectApiError(() => ledger.createTransfer({ ...base, amountCents: 0 }, "1"), 400, "Validation failed");
    expectApiError(() => ledger.createTransfer({ ...base, amountCents: 10.5 }, "2"), 400, "Validation failed");
    expectApiError(() => ledger.createTransfer({ ...base, amountCents: 100, reference: "x".repeat(36) }, "3"), 400, "Validation failed");
    expectApiError(() => ledger.createTransfer({ ...base, to: { type: "account", accountId: "a-cur" }, amountCents: 100 }, "4"), 400, "Validation failed");
    expectApiError(() => ledger.createTransfer({ ...base, to: { type: "payee", payeeId: "nope" }, amountCents: 100 }, "5"), 404, "Payee not found");
  });
});

describe("queries", () => {
  it("filters, searches and paginates newest-first", () => {
    const ledger = makeLedger();
    const page1 = ledger.getTransactions({ category: "dining", pageSize: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page1.items.every((t) => t.category === "dining")).toBe(true);
    const times = page1.items.map((t) => new Date(t.postedAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const page2 = ledger.getTransactions({ category: "dining", pageSize: 5, page: 2 });
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
    expect(page2.total).toBe(page1.total);

    expect(ledger.getTransactions({ q: "salary" }).items.every((t) => t.category === "salary")).toBe(true);
    const october = ledger.getTransactions({ from: "2026-10-01", to: "2026-10-31", pageSize: 100 });
    expect(october.items.every((t) => t.postedAt.startsWith("2026-10") || t.postedAt.startsWith("2026-09-30"))).toBe(true);
  });

  it("summarises cash flow without counting transfers between own accounts", () => {
    const ledger = makeLedger();
    const summary = ledger.getSpendingSummary(6);
    expect(summary.monthly.map((m) => m.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);

    const before = summary.monthly.at(-1)!;
    ledger.createTransfer({ fromAccountId: "a-cur", to: { type: "account", accountId: "a-sav" }, amountCents: 50_000, reference: "" }, "int");
    expect(ledger.getSpendingSummary(6).monthly.at(-1)).toEqual(before);

    ledger.createTransfer({ fromAccountId: "a-cur", to: { type: "payee", payeeId: "p-1" }, amountCents: 7_500, reference: "" }, "ext");
    const after = ledger.getSpendingSummary(6);
    expect(after.monthly.at(-1)!.expenseCents).toBe(before.expenseCents + 7_500);
    expect(after.categories.find((c) => c.category === "transfer")?.amountCents).toBe(7_500);
    expect(after.categories.some((c) => c.category === "salary")).toBe(false);
  });
});
