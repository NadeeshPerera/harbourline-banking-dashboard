import { CATEGORY_META } from "@/lib/categories";
import { formatSignedCents } from "@/lib/money";
import type { Account, Transaction } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short" });

export function TransactionList({
  transactions,
  accountsById,
}: {
  transactions: Transaction[];
  accountsById: Record<string, Account | undefined>;
}) {
  if (transactions.length === 0) {
    return <p className="p-6 text-center text-sm text-slate-500">No transactions found.</p>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {transactions.map((t) => {
        const meta = CATEGORY_META[t.category];
        return (
          <li key={t.id} className="flex items-center gap-3 px-5 py-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ background: meta.color }}
            >
              {meta.label.slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{t.description}</p>
              <p className="truncate text-xs text-slate-500">
                {dateFmt.format(new Date(t.postedAt))} · {meta.label} · {accountsById[t.accountId]?.name ?? "Account"}
              </p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${t.amountCents > 0 ? "text-emerald-700" : "text-slate-900"}`}>
              {formatSignedCents(t.amountCents)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
