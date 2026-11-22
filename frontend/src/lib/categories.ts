import type { Category } from "./types";

export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  salary: { label: "Salary", color: "#059669" },
  transfer: { label: "Transfers", color: "#64748b" },
  housing: { label: "Housing", color: "#1d4ed8" },
  utilities: { label: "Utilities", color: "#0891b2" },
  groceries: { label: "Groceries", color: "#16a34a" },
  dining: { label: "Dining", color: "#ea580c" },
  transport: { label: "Transport", color: "#7c3aed" },
  shopping: { label: "Shopping", color: "#db2777" },
  entertainment: { label: "Entertainment", color: "#ca8a04" },
  health: { label: "Health", color: "#dc2626" },
  other: { label: "Other", color: "#94a3b8" },
};
