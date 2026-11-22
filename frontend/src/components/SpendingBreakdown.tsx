"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORY_META } from "@/lib/categories";
import { formatCents } from "@/lib/money";
import type { SpendingSummary } from "@/lib/types";

export function SpendingBreakdown({ summary }: { summary: SpendingSummary }) {
  const { categories, thisMonthExpenseCents, lastMonthExpenseCents } = summary;
  const change = lastMonthExpenseCents ? (thisMonthExpenseCents - lastMonthExpenseCents) / lastMonthExpenseCents : 0;
  const top = categories.slice(0, 6);

  return (
    <figure className="card p-5">
      <figcaption>
        <h2 className="text-base font-semibold text-slate-900">Spending this month</h2>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatCents(thisMonthExpenseCents)}</p>
        {lastMonthExpenseCents > 0 && (
          <p className="text-sm text-slate-500">
            <span className={change > 0 ? "text-red-600" : "text-emerald-700"}>
              {change > 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}%
            </span>{" "}
            vs last month ({formatCents(lastMonthExpenseCents)})
          </p>
        )}
      </figcaption>

      {categories.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No spending yet this month.</p>
      ) : (
        <div className="mt-4 grid items-center gap-4 sm:grid-cols-[140px_1fr]">
          <div className="mx-auto h-36 w-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={top} dataKey="amountCents" nameKey="category" innerRadius={42} outerRadius={68} paddingAngle={2} stroke="none">
                  {top.map((c) => <Cell key={c.category} fill={CATEGORY_META[c.category].color} />)}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [formatCents(v), CATEGORY_META[name as keyof typeof CATEGORY_META]?.label ?? name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2 text-sm">
            {top.map((c) => (
              <li key={c.category} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-700">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_META[c.category].color }} />
                  {CATEGORY_META[c.category].label}
                </span>
                <span className="tabular-nums text-slate-900">{formatCents(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
