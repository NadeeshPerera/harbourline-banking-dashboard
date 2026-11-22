"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { isApiError } from "@/api/client";
import { useAccounts, useCreateTransfer, usePayees } from "@/api/queries";
import { ErrorState, Skeleton } from "@/components/states";
import { formatCents, maskAccountNumber, parseAmountToCents } from "@/lib/money";
import { DAILY_EXTERNAL_LIMIT_CENTS, MAX_REFERENCE_LENGTH, type TransferRequest, type TransferResult } from "@/lib/types";
import { makeTransferSchema, parseDestination, type TransferFormValues } from "./schema";

type Step = { name: "form" } | { name: "review"; request: TransferRequest; toLabel: string; idempotencyKey: string } | { name: "done"; result: TransferResult };

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function TransferFlow() {
  const accounts = useAccounts();
  const payees = usePayees();
  const transfer = useCreateTransfer();
  const [step, setStep] = useState<Step>({ name: "form" });

  const schema = useMemo(() => makeTransferSchema(accounts.data ?? []), [accounts.data]);
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fromAccountId: "", destination: "", amount: "", reference: "" },
  });
  const { register, handleSubmit, watch, reset, formState: { errors } } = form;
  const fromAccount = accounts.data?.find((a) => a.id === watch("fromAccountId"));
  const referenceLength = watch("reference")?.length ?? 0;

  if (accounts.isPending || payees.isPending) return <Skeleton className="h-96" />;
  if (accounts.error || payees.error) {
    return <ErrorState error={accounts.error ?? payees.error} onRetry={() => { accounts.refetch(); payees.refetch(); }} />;
  }

  const labelFor = (value: string) => {
    const dest = parseDestination(value);
    if (dest?.type === "account") return accounts.data.find((a) => a.id === dest.accountId)?.name ?? "";
    if (dest?.type === "payee") {
      const p = payees.data.find((x) => x.id === dest.payeeId);
      return p ? `${p.name} · ${p.bankName}` : "";
    }
    return "";
  };

  const onReview = (values: TransferFormValues) => {
    transfer.reset();
    setStep({
      name: "review",
      request: {
        fromAccountId: values.fromAccountId,
        to: parseDestination(values.destination)!,
        amountCents: parseAmountToCents(values.amount)!,
        reference: values.reference,
      },
      toLabel: labelFor(values.destination),
      // One key per reviewed transfer: retries and double-clicks can't pay twice.
      idempotencyKey: newKey(),
    });
  };

  if (step.name === "done") {
    const { result } = step;
    return (
      <div className="card mx-auto max-w-lg p-8 text-center" role="status">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700" aria-hidden>✓</div>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Transfer complete</h2>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{formatCents(result.amountCents)}</p>
        <p className="mt-1 text-slate-600">to {result.toName}</p>
        <dl className="mt-6 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Reference no.</dt><dd className="font-mono text-slate-900">{result.transferId}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">From</dt><dd className="text-slate-900">{result.fromAccount.name}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">New balance</dt><dd className="tabular-nums text-slate-900">{formatCents(result.fromAccount.balanceCents)}</dd></div>
          {result.reference && <div className="flex justify-between"><dt className="text-slate-500">Your reference</dt><dd className="text-slate-900">{result.reference}</dd></div>}
        </dl>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="btn-secondary" onClick={() => { reset(); setStep({ name: "form" }); }}>Make another transfer</button>
          <Link href="/" className="btn-primary">Back to overview</Link>
        </div>
      </div>
    );
  }

  if (step.name === "review") {
    const { request, toLabel, idempotencyKey } = step;
    const from = accounts.data.find((a) => a.id === request.fromAccountId);
    const confirm = () => transfer.mutate({ request, idempotencyKey }, { onSuccess: (result) => setStep({ name: "done", result }) });
    return (
      <div className="card mx-auto max-w-lg p-6">
        <h2 className="text-lg font-semibold text-slate-900">Review transfer</h2>
        <p className="mt-1 text-sm text-slate-500">Check the details before you confirm.</p>
        <dl className="mt-6 divide-y divide-slate-100 text-sm">
          <div className="flex justify-between py-3"><dt className="text-slate-500">Amount</dt><dd className="text-lg font-semibold tabular-nums text-slate-900">{formatCents(request.amountCents)}</dd></div>
          <div className="flex justify-between py-3"><dt className="text-slate-500">From</dt><dd className="text-right text-slate-900">{from?.name}<br /><span className="font-mono text-xs text-slate-500">{from && maskAccountNumber(from.accountNumber)}</span></dd></div>
          <div className="flex justify-between py-3"><dt className="text-slate-500">To</dt><dd className="text-right text-slate-900">{toLabel}</dd></div>
          <div className="flex justify-between py-3"><dt className="text-slate-500">Reference</dt><dd className="text-slate-900">{request.reference || "—"}</dd></div>
        </dl>
        {transfer.error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <strong className="font-semibold">{isApiError(transfer.error) ? transfer.error.title : "Transfer failed"}.</strong>{" "}
            {isApiError(transfer.error) ? transfer.error.detail : "Please try again."}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn-secondary" disabled={transfer.isPending} onClick={() => setStep({ name: "form" })}>Edit</button>
          <button type="button" className="btn-primary" disabled={transfer.isPending} onClick={confirm}>
            {transfer.isPending ? "Sending…" : `Confirm and send ${formatCents(request.amountCents)}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onReview)} noValidate className="card mx-auto max-w-lg space-y-5 p-6">
      <div>
        <label htmlFor="fromAccountId" className="label">From</label>
        <select id="fromAccountId" className="field" aria-invalid={!!errors.fromAccountId} aria-describedby="from-help" {...register("fromAccountId")}>
          <option value="">Select an account</option>
          {accounts.data.map((a) => <option key={a.id} value={a.id}>{a.name} ({maskAccountNumber(a.accountNumber)}) · {formatCents(a.balanceCents)}</option>)}
        </select>
        <p id="from-help" className="mt-1 text-sm text-red-600">{errors.fromAccountId?.message}</p>
      </div>

      <div>
        <label htmlFor="destination" className="label">To</label>
        <select id="destination" className="field" aria-invalid={!!errors.destination} aria-describedby="to-help" {...register("destination")}>
          <option value="">Select a recipient</option>
          <optgroup label="My accounts">
            {accounts.data.map((a) => <option key={a.id} value={`account:${a.id}`}>{a.name} ({maskAccountNumber(a.accountNumber)})</option>)}
          </optgroup>
          <optgroup label="Saved payees">
            {payees.data.map((p) => <option key={p.id} value={`payee:${p.id}`}>{p.name} · {p.bankName}</option>)}
          </optgroup>
        </select>
        <p id="to-help" className="mt-1 text-sm text-red-600">{errors.destination?.message}</p>
      </div>

      <div>
        <label htmlFor="amount" className="label">Amount (SGD)</label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">S$</span>
          <input id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" className="field pl-9 tabular-nums" aria-invalid={!!errors.amount} aria-describedby="amount-help" {...register("amount")} />
        </div>
        <p id="amount-help" className={`mt-1 text-sm ${errors.amount ? "text-red-600" : "text-slate-500"}`}>
          {errors.amount?.message ??
            (fromAccount ? `Available: ${formatCents(fromAccount.balanceCents)}` : `Up to ${formatCents(DAILY_EXTERNAL_LIMIT_CENTS)} per day to other people.`)}
        </p>
      </div>

      <div>
        <label htmlFor="reference" className="label">Reference <span className="font-normal text-slate-400">(optional)</span></label>
        <input id="reference" className="field" maxLength={MAX_REFERENCE_LENGTH + 10} aria-invalid={!!errors.reference} aria-describedby="reference-help" {...register("reference")} />
        <p id="reference-help" className={`mt-1 text-sm ${errors.reference ? "text-red-600" : "text-slate-500"}`}>
          {errors.reference?.message ?? `${referenceLength}/${MAX_REFERENCE_LENGTH} characters`}
        </p>
      </div>

      <button type="submit" className="btn-primary w-full">Review transfer</button>
    </form>
  );
}
