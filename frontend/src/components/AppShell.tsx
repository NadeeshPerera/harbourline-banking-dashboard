"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/transactions", label: "Transactions", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/transfer", label: "Transfer", icon: "M7 7h13l-4-4M17 17H4l4 4" },
];

/** Signed-in layout. Redirects to /login when there's no session. */
export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, logout, isDemo } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500" role="status">
        Loading your session…
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="relative border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Logo />
          <button type="button" onClick={logout} className="text-sm font-medium text-slate-600 hover:text-slate-900 lg:hidden">
            Sign out
          </button>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-5 py-6 lg:absolute lg:bottom-0 lg:block">
          <p className="text-sm font-medium text-slate-900">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <button type="button" onClick={logout} className="mt-3 text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        {isDemo && (
          <div className="bg-amber-50 px-6 py-2 text-center text-xs text-amber-900">
            Demo mode: a fictional bank with data simulated in your browser. Changes reset when you reload.
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
