const sgd = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });
const sgdCompact = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatCents = (cents: number) => sgd.format(cents / 100);

/** Signed display for transaction lists: "+S$1.00" / "−S$1.00". */
export function formatSignedCents(cents: number): string {
  if (cents === 0) return formatCents(0);
  return `${cents > 0 ? "+" : "−"}${formatCents(Math.abs(cents))}`;
}

export const formatCentsCompact = (cents: number) => sgdCompact.format(cents / 100);

/**
 * Parse user input like "1,234.5" into integer cents without floating-point maths.
 * Returns null for anything that isn't a positive amount with at most 2 decimals.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, "").replace(/^S?\$/i, "");
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  return dollars * 100 + cents;
}

/** Masks all but the last 4 digits: "123-45678-9" → "•••• 6789". */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  return `•••• ${digits.slice(-4)}`;
}
