"use client";

import { isApiError } from "@/api/client";
import { useExportTransactions } from "@/api/queries";
import type { TransactionFilters } from "@/lib/types";

/**
 * Exports every transaction matching the current filters (all pages, not just the visible one).
 * The outcome is announced in a polite live region so screen-reader users hear it.
 */
export function ExportCsvButton({ filters, total }: { filters: TransactionFilters; total: number | undefined }) {
  const exportCsv = useExportTransactions();

  const status = exportCsv.isPending
    ? "Preparing your CSV…"
    : exportCsv.isSuccess
      ? `Downloaded ${exportCsv.data.filename}`
      : "";

  return (
    <div className="flex items-center gap-3">
      <span role="status" className="text-xs text-slate-500">{status}</span>
      {exportCsv.isError && (
        <span role="alert" className="text-xs text-red-700">
          {isApiError(exportCsv.error) ? exportCsv.error.message : "Export failed. Please try again."}
        </span>
      )}
      <button
        type="button"
        className="btn-secondary px-3 py-1.5"
        disabled={exportCsv.isPending || !total}
        aria-describedby="export-csv-hint"
        onClick={() => exportCsv.mutate(filters)}
      >
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 2.75a.75.75 0 0 1 .75.75v7.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06l2.72 2.72V3.5A.75.75 0 0 1 10 2.75ZM3.5 13.25a.75.75 0 0 1 .75.75v1.5c0 .14.11.25.25.25h11a.25.25 0 0 0 .25-.25V14a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 15.5 17.25h-11A1.75 1.75 0 0 1 2.75 15.5V14a.75.75 0 0 1 .75-.75Z" />
        </svg>
        {exportCsv.isPending ? "Exporting…" : "Export CSV"}
      </button>
      <span id="export-csv-hint" className="sr-only">Downloads all transactions that match the current filters</span>
    </div>
  );
}
