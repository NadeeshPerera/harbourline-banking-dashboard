/**
 * In-memory ledger with the same business rules as the .NET backend.
 * Pure TypeScript (no React, no timers) so every rule is unit-testable.
 */
import {
  DAILY_EXTERNAL_LIMIT_CENTS,
  MAX_REFERENCE_LENGTH,
  type Account,
  type Category,
  type Page,
  type Payee,
  type SpendingSummary,
  type Transaction,
  type TransactionQuery,
  type TransferRequest,
  type TransferResult,
} from "@/lib/types";
import { ApiError } from "../client";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayKey = (d: Date) => `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;

const validation = (field: string, message: string) =>
  new ApiError(400, "Validation failed", message, { [field]: [message] });

export class Ledger {
  private accounts: Map<string, Account>;
  /** Newest first. */
  private transactions: Transaction[];
  private readonly idempotency = new Map<string, TransferResult>();
  /** Ids of money-out transactions to third-party payees (count towards the daily limit). */
  private readonly externalIds = new Set<string>();
  private seq = 0;

  constructor(
    accounts: Account[],
    transactions: Transaction[],
    private readonly payees: Payee[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.accounts = new Map(accounts.map((a) => [a.id, { ...a }]));
    this.transactions = [...transactions];
  }

  getAccounts(): Account[] {
    return [...this.accounts.values()].map((a) => ({ ...a }));
  }

  getPayees(): Payee[] {
    return this.payees.map((p) => ({ ...p }));
  }

  getTransactions(query: TransactionQuery): Page<Transaction> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const q = query.q?.trim().toLowerCase();

    const filtered = this.transactions.filter((t) => {
      if (query.accountId && t.accountId !== query.accountId) return false;
      if (query.category && t.category !== query.category) return false;
      const day = dayKey(new Date(t.postedAt));
      if (query.from && day < query.from) return false;
      if (query.to && day > query.to) return false;
      if (q && !`${t.description} ${t.reference ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: filtered.length,
    };
  }

  /** Income and expenses per month. Transfers between own accounts are excluded. */
  getSpendingSummary(months: number): SpendingSummary {
    const now = this.now();
    const keys: string[] = [];
    for (let i = months - 1; i >= 0; i--) keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    const thisMonth = keys[keys.length - 1];
    const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const monthly = new Map(keys.map((k) => [k, { month: k, incomeCents: 0, expenseCents: 0 }]));
    const byCategory = new Map<Category, number>();
    let lastMonthExpense = 0;

    for (const t of this.transactions) {
      if (t.category === "transfer" && this.isInternal(t)) continue;
      const key = monthKey(new Date(t.postedAt));
      const bucket = monthly.get(key);
      if (t.amountCents > 0) {
        if (bucket) bucket.incomeCents += t.amountCents;
        continue;
      }
      const spend = -t.amountCents;
      if (bucket) bucket.expenseCents += spend;
      if (key === lastMonth) lastMonthExpense += spend;
      if (key === thisMonth) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + spend);
    }

    return {
      monthly: [...monthly.values()],
      categories: [...byCategory.entries()]
        .map(([category, amountCents]) => ({ category, amountCents }))
        .sort((a, b) => b.amountCents - a.amountCents),
      thisMonthExpenseCents: monthly.get(thisMonth)?.expenseCents ?? 0,
      lastMonthExpenseCents: lastMonthExpense,
    };
  }

  createTransfer(request: TransferRequest, idempotencyKey: string): TransferResult {
    // Replaying the same key returns the original result instead of paying twice.
    const previous = this.idempotency.get(idempotencyKey);
    if (previous) return previous;

    const from = this.accounts.get(request.fromAccountId);
    if (!from) throw new ApiError(404, "Account not found");
    if (!Number.isInteger(request.amountCents) || request.amountCents <= 0) {
      throw validation("amountCents", "Amount must be greater than zero.");
    }
    const reference = request.reference.trim();
    if (reference.length > MAX_REFERENCE_LENGTH) {
      throw validation("reference", `Reference must be ${MAX_REFERENCE_LENGTH} characters or fewer.`);
    }
    if (request.amountCents > from.balanceCents) {
      throw new ApiError(422, "Insufficient funds", `Your available balance is too low for this transfer.`);
    }

    const now = this.now();
    let toName: string;
    let toAccount: Account | undefined;

    if (request.to.type === "account") {
      const { accountId } = request.to;
      toAccount = this.accounts.get(accountId);
      if (!toAccount) throw new ApiError(404, "Destination account not found");
      if (toAccount.id === from.id) throw validation("to", "Choose a different account to transfer to.");
      toName = toAccount.name;
    } else {
      const { payeeId } = request.to;
      const payee = this.payees.find((p) => p.id === payeeId);
      if (!payee) throw new ApiError(404, "Payee not found");
      const usedToday = this.externalTotalOn(now);
      if (usedToday + request.amountCents > DAILY_EXTERNAL_LIMIT_CENTS) {
        throw new ApiError(
          422,
          "Daily limit exceeded",
          `Transfers to other people are limited to S$${DAILY_EXTERNAL_LIMIT_CENTS / 100} per day. ` +
            `You have S$${((DAILY_EXTERNAL_LIMIT_CENTS - usedToday) / 100).toFixed(2)} left today.`,
        );
      }
      toName = payee.name;
    }

    const transferId = `TRF-${now.getTime().toString(36).toUpperCase()}-${++this.seq}`;
    this.post(from, -request.amountCents, `Transfer to ${toName}`, reference, now, !toAccount);
    if (toAccount) this.post(toAccount, request.amountCents, `Transfer from ${from.name}`, reference, now, false);

    const result: TransferResult = {
      transferId,
      createdAt: now.toISOString(),
      fromAccount: { ...from },
      amountCents: request.amountCents,
      toName,
      reference,
    };
    this.idempotency.set(idempotencyKey, result);
    return result;
  }

  private post(account: Account, amountCents: number, description: string, reference: string, at: Date, external: boolean) {
    account.balanceCents += amountCents;
    const tx: Transaction = {
      id: `t-live-${++this.seq}`,
      accountId: account.id,
      postedAt: at.toISOString(),
      description,
      category: "transfer",
      amountCents,
      balanceAfterCents: account.balanceCents,
      reference: reference || null,
    };
    if (external) this.externalIds.add(tx.id);
    this.transactions.unshift(tx);
  }

  private externalTotalOn(date: Date): number {
    const today = dayKey(date);
    return this.transactions
      .filter((t) => this.externalIds.has(t.id) && dayKey(new Date(t.postedAt)) === today)
      .reduce((sum, t) => sum - t.amountCents, 0);
  }

  /** Seeded transfers between own accounts start with "Transfer to/from <own account name>". */
  private isInternal(t: Transaction): boolean {
    if (this.externalIds.has(t.id)) return false;
    const names = [...this.accounts.values()].map((a) => a.name);
    return names.some((n) => t.description.endsWith(n));
  }
}
