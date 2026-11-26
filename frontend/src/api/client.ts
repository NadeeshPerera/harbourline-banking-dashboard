import type {
  Account,
  AuthResponse,
  Page,
  Payee,
  SpendingSummary,
  Transaction,
  TransactionFilters,
  TransactionQuery,
  TransferRequest,
  TransferResult,
  User,
} from "@/lib/types";

/**
 * The frontend talks to this interface only. Two implementations:
 *  - HttpBankApi: the real ASP.NET Core API (set NEXT_PUBLIC_API_URL)
 *  - DemoBankApi: in-browser implementation with the same rules, used for the
 *    hosted demo so it works without a backend.
 */
export interface BankApi {
  login(email: string, password: string): Promise<AuthResponse>;
  me(): Promise<User>;
  getAccounts(): Promise<Account[]>;
  getTransactions(query: TransactionQuery): Promise<Page<Transaction>>;
  /** Every transaction matching the filters (all pages) as a CSV file. */
  exportTransactions(filters: TransactionFilters): Promise<FileDownload>;
  getSpendingSummary(months: number): Promise<SpendingSummary>;
  getPayees(): Promise<Payee[]>;
  createTransfer(request: TransferRequest, idempotencyKey: string): Promise<TransferResult>;
}

/** A file returned by the API, ready to save. */
export interface FileDownload {
  filename: string;
  blob: Blob;
}

/** Mirrors RFC 7807 ProblemDetails returned by the backend. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(detail ?? title);
    this.name = "ApiError";
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
