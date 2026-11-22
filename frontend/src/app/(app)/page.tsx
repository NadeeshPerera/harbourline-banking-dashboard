"use client";

import Link from "next/link";
import { useAccounts, useSpendingSummary, useTransactions } from "@/api/queries";
import { useAuth } from "@/auth/AuthProvider";
import { AccountCards } from "@/components/AccountCards";
import { CashflowChart } from "@/components/CashflowChart";
import { SpendingBreakdown } from "@/components/SpendingBreakdown";
import { ErrorState, Skeleton } from "@/components/states";
import { TransactionList } from "@/components/TransactionList";

function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function OverviewPage() {
  const { user } = useAuth();
  const summary = useSpendingSummary(6);
  const recent = useTransactions({ page: 1, pageSize: 6 });
  const accounts = useAccounts();
  const accountsById = Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{greeting()},</p>
          <h1 className="text-2xl font-semibold text-slate-900">{user?.name.split(" ")[0]}</h1>
        </div>
        <Link href="/transfer" className="btn-primary">Make a transfer</Link>
      </header>

      <AccountCards />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {summary.isPending ? (
          <Skeleton className="h-80" />
        ) : summary.error ? (
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          <CashflowChart data={summary.data.monthly} />
        )}
        {summary.isPending ? <Skeleton className="h-80" /> : summary.data ? <SpendingBreakdown summary={summary.data} /> : null}
      </div>

      <section className="card" aria-labelledby="recent-heading">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="recent-heading" className="text-base font-semibold text-slate-900">Recent activity</h2>
          <Link href="/transactions" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">View all</Link>
        </div>
        {recent.isPending ? (
          <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : recent.error ? (
          <div className="p-5"><ErrorState error={recent.error} onRetry={() => recent.refetch()} /></div>
        ) : (
          <TransactionList transactions={recent.data.items} accountsById={accountsById} />
        )}
      </section>
    </div>
  );
}
