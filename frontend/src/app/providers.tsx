"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isApiError } from "@/api/client";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";

function QueryProvider({ children }: { children: ReactNode }) {
  const { logout, status } = useAuth();
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const [client] = useState(() => {
    // An expired or invalid session anywhere signs the user out.
    const onError = (error: unknown) => {
      if (isApiError(error) && error.status === 401) logoutRef.current();
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  // Never show one session's cached balances to the next person who signs in.
  useEffect(() => {
    if (status === "anonymous") client.clear();
  }, [status, client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>{children}</QueryProvider>
    </AuthProvider>
  );
}
