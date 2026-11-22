"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyCashflow } from "@/lib/types";
import { formatCents, formatCentsCompact } from "@/lib/money";

const monthLabel = (key: string) =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString("en-SG", { month: "short" });

export function CashflowChart({ data }: { data: MonthlyCashflow[] }) {
  const rows = data.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const netCents = data.reduce((sum, m) => sum + m.incomeCents - m.expenseCents, 0);

  return (
    <figure className="card p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Cash flow</h2>
        <p className="text-sm text-slate-500">
          Net over {data.length} months:{" "}
          <span className={`font-semibold tabular-nums ${netCents >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {formatCents(netCents)}
          </span>
        </p>
      </figcaption>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={4} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
            <YAxis
              tickFormatter={(v: number) => formatCentsCompact(v)}
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCents(value), name]}
              cursor={{ fill: "#f1f5f9" }}
              contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0" }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="incomeCents" name="Money in" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenseCents" name="Money out" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Text alternative for screen readers */}
      <table className="sr-only">
        <caption>Monthly money in and money out</caption>
        <thead>
          <tr><th>Month</th><th>Money in</th><th>Money out</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}><td>{r.label}</td><td>{formatCents(r.incomeCents)}</td><td>{formatCents(r.expenseCents)}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
