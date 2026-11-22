/**
 * API contract shared by the demo API and the real .NET backend.
 * All money values are integer cents (SGD) to avoid floating-point errors.
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type AccountType = "savings" | "current";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  accountNumber: string;
  currency: "SGD";
  balanceCents: number;
}

export const CATEGORIES = [
  "salary",
  "transfer",
  "housing",
  "utilities",
  "groceries",
  "dining",
  "transport",
  "shopping",
  "entertainment",
  "health",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Transaction {
  id: string;
  accountId: string;
  /** ISO-8601 timestamp */
  postedAt: string;
  description: string;
  category: Category;
  /** Signed: negative = money out, positive = money in. */
  amountCents: number;
  balanceAfterCents: number;
  reference: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface TransactionQuery {
  accountId?: string;
  category?: Category;
  /** yyyy-mm-dd, inclusive */
  from?: string;
  /** yyyy-mm-dd, inclusive */
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface MonthlyCashflow {
  /** yyyy-mm */
  month: string;
  incomeCents: number;
  expenseCents: number;
}

export interface CategorySpend {
  category: Category;
  amountCents: number;
}

export interface SpendingSummary {
  monthly: MonthlyCashflow[];
  /** Spending by category for the current month. */
  categories: CategorySpend[];
  thisMonthExpenseCents: number;
  lastMonthExpenseCents: number;
}

export interface Payee {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
}

export type TransferDestination = { type: "account"; accountId: string } | { type: "payee"; payeeId: string };

export interface TransferRequest {
  fromAccountId: string;
  to: TransferDestination;
  amountCents: number;
  reference: string;
}

export interface TransferResult {
  transferId: string;
  createdAt: string;
  fromAccount: Account;
  amountCents: number;
  toName: string;
  reference: string;
}

/** Limits enforced by both backends. */
export const DAILY_EXTERNAL_LIMIT_CENTS = 500_000; // S$5,000 to third-party payees per day
export const MAX_REFERENCE_LENGTH = 35;
