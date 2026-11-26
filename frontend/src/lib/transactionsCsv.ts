/**
 * Transactions CSV export (RFC 4180), byte-for-byte the same as the .NET API's
 * backend/src/Harbourline.Api/Features/Banking/TransactionCsv.cs, so the demo ledger
 * and the real backend export identical files.
 */
import type { Transaction } from "./types";

export const CSV_HEADER = [
  "Date (SGT)",
  "Description",
  "Reference",
  "Category",
  "Account",
  "Amount (SGD)",
  "Balance (SGD)",
] as const;

/** UTF-8 byte order mark, so Excel renders non-ASCII text correctly. */
export const UTF8_BOM = "﻿";

const SG_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore is UTC+8 all year (no DST).
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "2026-11-15 12:00" in Singapore time, whatever the browser's time zone. */
export function formatSgDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + SG_OFFSET_MS);
  return `${formatSgDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const formatSgDate = (shifted: Date) =>
  `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;

export const exportFileName = (now: Date) =>
  `harbourline-transactions-${formatSgDate(new Date(now.getTime() + SG_OFFSET_MS))}.csv`;

/** Integer cents to a plain decimal string ("-1234.50") with no floating point. */
export function formatCentsPlain(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${pad(abs % 100)}`;
}

/** Quotes a field when it contains a comma, quote or line break; embedded quotes are doubled. */
export const escapeCsvField = (field: string) =>
  /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;

/**
 * Free text can come from other people (payee names, references). A leading = + - @ (or tab / CR)
 * would make Excel or Sheets run it as a formula, so prefix it with an apostrophe (OWASP CSV injection).
 */
export const csvText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const row = (fields: readonly string[]) => `${fields.map(escapeCsvField).join(",")}\r\n`;

export function buildTransactionsCsv(transactions: Transaction[], accountNames: Record<string, string>): string {
  return (
    row(CSV_HEADER) +
    transactions
      .map((t) =>
        row([
          formatSgDateTime(t.postedAt),
          csvText(t.description),
          csvText(t.reference ?? ""),
          t.category,
          csvText(accountNames[t.accountId] ?? ""),
          formatCentsPlain(t.amountCents),
          formatCentsPlain(t.balanceAfterCents),
        ]),
      )
      .join("")
  );
}
