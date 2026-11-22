import type {
  Account,
  AuthResponse,
  Page,
  Payee,
  SpendingSummary,
  Transaction,
  TransactionQuery,
  TransferRequest,
  TransferResult,
  User,
} from "@/lib/types";
import { ApiError, type BankApi } from "./client";

/** Client for the ASP.NET Core API in /backend. */
export class HttpBankApi implements BankApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const problem = await res.json().catch(() => ({}));
      throw new ApiError(res.status, problem.title ?? res.statusText, problem.detail, problem.errors);
    }
    return res.json() as Promise<T>;
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  me() {
    return this.request<User>("/api/me");
  }

  getAccounts() {
    return this.request<Account[]>("/api/accounts");
  }

  getTransactions(query: TransactionQuery) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return this.request<Page<Transaction>>(`/api/transactions?${params}`);
  }

  getSpendingSummary(months: number) {
    return this.request<SpendingSummary>(`/api/analytics/summary?months=${months}`);
  }

  getPayees() {
    return this.request<Payee[]>("/api/payees");
  }

  createTransfer(request: TransferRequest, idempotencyKey: string) {
    return this.request<TransferResult>("/api/transfers", {
      method: "POST",
      body: JSON.stringify(request),
      headers: { "Idempotency-Key": idempotencyKey },
    });
  }
}
