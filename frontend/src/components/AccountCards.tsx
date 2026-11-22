"use client";

import Link from "next/link";
import { useAccounts } from "@/api/queries";
import { formatCents, maskAccountNumber } from "@/lib/money";
import { ErrorState, Skeleton } from "./states";

export function AccountCards() {
  const { data: accounts, isPending, error, refetch } = useAccounts();

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  const total = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <section aria-label="Accounts" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-5 text-white shadow-sm">
        <p className="text-sm text-emerald-100">Total balance</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{formatCents(total)}</p>
        <p className="mt-4 text-xs text-emerald-200">Across {accounts.length} accounts</p>
      </div>
      {accounts.map((account) => (
        <Link
          key={account.id}
          href={`/transactions?accountId=${account.id}`}
          className="card p-5 transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">{account.name}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{account.type}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{formatCents(account.balanceCents)}</p>
          <p className="mt-4 font-mono text-xs text-slate-500" aria-label={`Account ending ${account.accountNumber.slice(-4)}`}>
            {maskAccountNumber(account.accountNumber)}
          </p>
        </Link>
      ))}
    </section>
  );
}
