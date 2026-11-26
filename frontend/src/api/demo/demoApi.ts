import { UTF8_BOM, exportFileName } from "@/lib/transactionsCsv";
import type { TransactionFilters, TransactionQuery, TransferRequest } from "@/lib/types";
import { ApiError, type BankApi, type FileDownload } from "../client";
import { Ledger } from "./ledger";
import { DEMO_PASSWORD, DEMO_PAYEES, DEMO_USER, buildSeed } from "./seed";

const DEMO_TOKEN = "demo-session";

/** BankApi implemented in the browser. Data resets on page reload. */
export class DemoBankApi implements BankApi {
  private readonly ledger: Ledger;

  private readonly latencyMs: number;

  private readonly now: () => Date;

  constructor(
    private readonly getToken: () => string | null,
    { latencyMs = 350, now = () => new Date() }: { latencyMs?: number; now?: () => Date } = {},
  ) {
    this.latencyMs = latencyMs;
    this.now = now;
    const { accounts, transactions } = buildSeed(now());
    this.ledger = new Ledger(accounts, transactions, DEMO_PAYEES, now);
  }

  private async respond<T>(fn: () => T, { auth = true } = {}): Promise<T> {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    if (auth && this.getToken() !== DEMO_TOKEN) throw new ApiError(401, "Unauthorized", "Please sign in again.");
    // Return copies so callers can never mutate the "server" state.
    return structuredClone(fn());
  }

  login(email: string, password: string) {
    return this.respond(
      () => {
        if (email.trim().toLowerCase() !== DEMO_USER.email || password !== DEMO_PASSWORD) {
          throw new ApiError(401, "Invalid credentials", "Email or password is incorrect.");
        }
        return { token: DEMO_TOKEN, user: DEMO_USER };
      },
      { auth: false },
    );
  }

  me() {
    return this.respond(() => DEMO_USER);
  }

  getAccounts() {
    return this.respond(() => this.ledger.getAccounts());
  }

  getTransactions(query: TransactionQuery) {
    return this.respond(() => this.ledger.getTransactions(query));
  }

  async exportTransactions(filters: TransactionFilters): Promise<FileDownload> {
    const csv = await this.respond(() => this.ledger.exportCsv(filters));
    return {
      filename: exportFileName(this.now()),
      blob: new Blob([UTF8_BOM + csv], { type: "text/csv;charset=utf-8" }),
    };
  }

  getSpendingSummary(months: number) {
    return this.respond(() => this.ledger.getSpendingSummary(months));
  }

  getPayees() {
    return this.respond(() => this.ledger.getPayees());
  }

  createTransfer(request: TransferRequest, idempotencyKey: string) {
    return this.respond(() => this.ledger.createTransfer(request, idempotencyKey));
  }
}
