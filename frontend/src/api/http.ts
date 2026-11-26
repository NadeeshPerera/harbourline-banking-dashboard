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
import { ApiError, type BankApi, type FileDownload } from "./client";

/** Client for the ASP.NET Core API in /backend. */
export class HttpBankApi implements BankApi {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.send(path, init);
    return res.json() as Promise<T>;
  }

  /** Sends an authenticated request and turns error responses into ApiError. */
  private async send(path: string, init: RequestInit = {}): Promise<Response> {
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
    return res;
  }

  private static query(values: object): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return params;
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
    return this.request<Page<Transaction>>(`/api/transactions?${HttpBankApi.query(query)}`);
  }

  async exportTransactions(filters: TransactionFilters): Promise<FileDownload> {
    const res = await this.send(`/api/transactions/export?${HttpBankApi.query(filters)}`, {
      headers: { Accept: "text/csv" },
    });
    return { filename: filenameFrom(res.headers.get("Content-Disposition")), blob: await res.blob() };
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

/** Reads the filename from a Content-Disposition header, preferring the RFC 5987 filename* form. */
export function filenameFrom(contentDisposition: string | null): string {
  const header = contentDisposition ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) return decodeURIComponent(encoded[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? "transactions.csv";
}
