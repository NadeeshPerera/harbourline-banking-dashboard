"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isApiError } from "@/api/client";
import { DEMO_PASSWORD, DEMO_USER } from "@/api/demo/seed";
import { useAuth } from "@/auth/AuthProvider";
import { Logo } from "@/components/Logo";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, status, isDemo } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      router.replace("/");
    } catch (error) {
      setServerError(isApiError(error) ? error.message : "Something went wrong. Please try again.");
    }
  };

  const fillDemoCredentials = () => {
    setValue("email", DEMO_USER.email, { shouldValidate: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-slate-900 p-10 text-white lg:flex">
        <Logo inverted />
        <div>
          <h2 className="text-3xl font-semibold leading-tight">Your money, clearly.</h2>
          <p className="mt-3 max-w-sm text-slate-300">
            Balances, spending insights and instant transfers in one place.
          </p>
        </div>
        <p className="text-xs text-slate-500">Harbourline Bank is a fictional bank for a portfolio demo.</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Welcome back to online banking.</p>

          {isDemo && (
            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">Demo mode</p>
              <p className="mt-0.5 text-emerald-800">No real data. Use the demo account to look around.</p>
              <button type="button" onClick={fillDemoCredentials} className="mt-2 font-semibold underline underline-offset-2">
                Fill in demo credentials
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="field"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
              {errors.email && <p id="email-error" className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="field"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                {...register("password")}
              />
              {errors.password && <p id="password-error" className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            {serverError && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{serverError}</p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
