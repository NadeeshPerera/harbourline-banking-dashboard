"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BankApi } from "@/api/client";
import { DemoBankApi } from "@/api/demo/demoApi";
import { HttpBankApi } from "@/api/http";
import type { User } from "@/lib/types";

const STORAGE_KEY = "harbourline.session";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  api: BankApi;
  isDemo: boolean;
  status: Status;
  user: User | null;
  login(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Holds the session and the API client.
 * The token lives in memory and sessionStorage (cleared when the tab closes).
 * Production would use an httpOnly refresh cookie; see ROADMAP.md.
 */
export function AuthProvider({ children, api: injectedApi }: { children: ReactNode; api?: BankApi }) {
  const tokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  const [{ api, isDemo }] = useState(() => {
    if (injectedApi) return { api: injectedApi, isDemo: false };
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const getToken = () => tokenRef.current;
    return baseUrl
      ? { api: new HttpBankApi(baseUrl, getToken), isDemo: false }
      : { api: new DemoBankApi(getToken), isDemo: true };
  });

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const session = JSON.parse(saved) as { token: string; user: User };
        tokenRef.current = session.token;
        setUser(session.user);
        setStatus("authenticated");
        return;
      }
    } catch {
      // Storage unavailable or corrupted; fall through to signed-out.
    }
    setStatus("anonymous");
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.login(email, password);
      tokenRef.current = session.token;
      setUser(session.user);
      setStatus("authenticated");
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Non-fatal: the session just won't survive a reload.
      }
    },
    [api],
  );

  const logout = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    setStatus("anonymous");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ api, isDemo, status, user, login, logout }), [api, isDemo, status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
