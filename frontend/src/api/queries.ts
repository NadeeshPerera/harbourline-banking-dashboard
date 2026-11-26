"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { saveFile } from "@/lib/download";
import type { TransactionFilters, TransactionQuery, TransferRequest } from "@/lib/types";

/** Centralised query keys so invalidation stays consistent. */
export const queryKeys = {
  accounts: ["accounts"] as const,
  transactions: (q: TransactionQuery) => ["transactions", q] as const,
  allTransactions: ["transactions"] as const,
  summary: (months: number) => ["summary", months] as const,
  allSummaries: ["summary"] as const,
  payees: ["payees"] as const,
};

export function useAccounts() {
  const { api } = useAuth();
  return useQuery({ queryKey: queryKeys.accounts, queryFn: () => api.getAccounts() });
}

export function useTransactions(query: TransactionQuery) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.transactions(query),
    queryFn: () => api.getTransactions(query),
    // Keep the current page on screen while the next one loads (no table flicker).
    placeholderData: keepPreviousData,
  });
}

/** Downloads every transaction matching the filters as CSV and saves it. */
export function useExportTransactions() {
  const { api } = useAuth();
  return useMutation({
    mutationFn: async (filters: TransactionFilters) => {
      const file = await api.exportTransactions(filters);
      saveFile(file);
      return file;
    },
  });
}

export function useSpendingSummary(months = 6) {
  const { api } = useAuth();
  return useQuery({ queryKey: queryKeys.summary(months), queryFn: () => api.getSpendingSummary(months) });
}

export function usePayees() {
  const { api } = useAuth();
  return useQuery({ queryKey: queryKeys.payees, queryFn: () => api.getPayees(), staleTime: 5 * 60_000 });
}

export function useCreateTransfer() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ request, idempotencyKey }: { request: TransferRequest; idempotencyKey: string }) =>
      api.createTransfer(request, idempotencyKey),
    onSuccess: () => {
      // Balances, statements and analytics all change after a transfer.
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTransactions });
      queryClient.invalidateQueries({ queryKey: queryKeys.allSummaries });
    },
  });
}
