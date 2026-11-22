export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden viewBox="0 0 32 32" className="h-8 w-8">
        <rect width="32" height="32" rx="8" fill="#047857" />
        <path d="M6 20c3-3 6-3 10 0s7 3 10 0M6 14c3-3 6-3 10 0s7 3 10 0" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${inverted ? "text-white" : "text-slate-900"}`}>
        Harbourline<span className="text-emerald-600"> Bank</span>
      </span>
    </span>
  );
}
