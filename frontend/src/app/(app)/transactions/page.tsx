"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAccounts, useTransactions } from "@/api/queries";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { ErrorState, Skeleton } from "@/components/states";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { CATEGORY_META } from "@/lib/categories";
import { formatCents, formatSignedCents } from "@/lib/money";
import { CATEGORIES, type Category, type TransactionFilters, type TransactionQuery } from "@/lib/types";

const PAGE_SIZE = 15;
const dateTimeFmt = new Intl.DateTimeFormat("en-SG", { day: "2-digit", month: "short", year: "numeric" });

function TransactionsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The URL is the source of truth for filters.
  const filters: TransactionFilters = {
    accountId: params.get("accountId") ?? undefined,
    category: (params.get("category") as Category | null) ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    q: params.get("q") ?? undefined,
  };
  const query: TransactionQuery = {
    ...filters,
    page: Number(params.get("page") ?? 1),
    pageSize: PAGE_SIZE,
  };

  const setParams = (updates: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete("page");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  // Search box: local state, debounced into the URL.
  const [search, setSearch] = useState(query.q ?? "");
  const debouncedSearch = useDebouncedValue(search, 300);
  useEffect(() => {
    if ((query.q ?? "") !== debouncedSearch) setParams({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced value
  }, [debouncedSearch]);

  const accounts = useAccounts();
  const accountsById = Object.fromEntries((accounts.data ?? []).map((a) => [a.id, a]));
  const { data, isPending, isFetching, error, refetch } = useTransactions(query);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasFilters = Boolean(query.accountId || query.category || query.from || query.to || query.q);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Transactions</h1>

      <section aria-label="Filters" className="card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="label">Search</label>
          <input id="q" type="search" className="field" placeholder="Description or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="account" className="label">Account</label>
          <select id="account" className="field" value={query.accountId ?? ""} onChange={(e) => setParams({ accountId: e.target.value || undefined })}>
            <option value="">All accounts</option>
            {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" className="field" value={query.category ?? ""} onChange={(e) => setParams({ category: e.target.value || undefined })}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="from" className="label">From</label>
            <input id="from" type="date" className="field px-2" value={query.from ?? ""} max={query.to} onChange={(e) => setParams({ from: e.target.value || undefined })} />
          </div>
          <div>
            <label htmlFor="to" className="label">To</label>
            <input id="to" type="date" className="field px-2" value={query.to ?? ""} min={query.from} onChange={(e) => setParams({ to: e.target.value || undefined })} />
          </div>
        </div>
        {hasFilters && (
          <div className="sm:col-span-2 lg:col-span-5">
            <button
              type="button"
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
              onClick={() => {
                setSearch("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </section>

      <section className="card overflow-hidden" aria-labelledby="results-heading" aria-busy={isFetching}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 id="results-heading" className="text-sm font-medium text-slate-600" aria-live="polite">
            {data ? `${data.total} transaction${data.total === 1 ? "" : "s"}` : "Loading…"}
          </h2>
          <div className="flex items-center gap-3">
            {isFetching && !isPending && <span className="text-xs text-slate-400">Updating…</span>}
            <ExportCsvButton filters={filters} total={data?.total} />
          </div>
        </div>

        {isPending ? (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : error ? (
          <div className="p-5"><ErrorState error={error} onRetry={() => refetch()} /></div>
        ) : data.items.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No transactions match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`w-full min-w-[760px] text-left text-sm transition-opacity ${isFetching ? "opacity-60" : ""}`}>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-5 py-2 font-medium">Date</th>
                  <th scope="col" className="px-5 py-2 font-medium">Description</th>
                  <th scope="col" className="px-5 py-2 font-medium">Category</th>
                  <th scope="col" className="px-5 py-2 font-medium">Account</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500">{dateTimeFmt.format(new Date(t.postedAt))}</td>
                    <td className="px-5 py-3">
                      <span className="font-medium text-slate-900">{t.description}</span>
                      {t.reference && <span className="ml-2 font-mono text-xs text-slate-400">{t.reference}</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-700">
                        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[t.category].color }} />
                        {CATEGORY_META[t.category].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{accountsById[t.accountId]?.name ?? "—"}</td>
                    <td className={`whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums ${t.amountCents > 0 ? "text-emerald-700" : "text-slate-900"}`}>
                      {formatSignedCents(t.amountCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-500">{formatCents(t.balanceAfterCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <nav aria-label="Pagination" className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
            <span className="text-slate-500">Page {data.page} of {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5" disabled={data.page <= 1} onClick={() => setParams({ page: String(data.page - 1) }, false)}>
                Previous
              </button>
              <button type="button" className="btn-secondary px-3 py-1.5" disabled={data.page >= totalPages} onClick={() => setParams({ page: String(data.page + 1) }, false)}>
                Next
              </button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}

export default function TransactionsPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <TransactionsView />
    </Suspense>
  );
}
