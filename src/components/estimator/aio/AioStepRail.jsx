
const STEPS = [
  { n: 1, key: "details", label: "Estimate Details" },
  { n: 2, key: "build", label: "Edit Products" },
  { n: 3, key: "customer", label: "Finalize Estimate" },
];

const REVIEW = ["Cost Summary", "Bill of Materials"];

export default function AioStepRail({
  activeStep = 1,
  onStepClick,
  estimateNumber,
  clientName,
  description,
  taxPercent = 0,
  summary,
  stepDone = {},
  onSaveProgress,
  saving,
  dirty,
  readOnly = false,
}) {
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;
  const s = summary || {};

  const done = {
    1: stepDone.details ?? !!(clientName && description),
    2: stepDone.build ?? false,
    3: stepDone.customer ?? false,
  };

  return (
    <div className="w-60 flex-shrink-0 space-y-3">
      <div className="bg-white border border-slate-300 rounded-sm overflow-hidden">
        <div className="px-3 py-2 bg-slate-800 border-b border-slate-300">
          <p className="text-xs font-bold text-lime-400 uppercase tracking-wide truncate">
            Estimate{estimateNumber ? ` — ${estimateNumber}` : " — New"}
          </p>
        </div>
        {STEPS.map((step) => {
          const active = step.n === activeStep;
          return (
            <button
              key={step.key}
              onClick={() => onStepClick?.(step.n)}
              className={`w-full text-left px-3 py-2 border-b border-slate-200 transition-colors ${
                active
                  ? "bg-lime-100 border-l-4 border-l-lime-600"
                  : "bg-slate-50 hover:bg-slate-100 border-l-4 border-l-transparent"
              }`}
            >
              <p className="text-[11px] font-bold text-slate-800 flex items-center justify-between">
                Step {step.n}
                {done[step.n] && <span className="text-lime-600 text-xs" title="Completed">✔</span>}
              </p>
              <p className="text-sm text-slate-700">{step.label}</p>
            </button>
          );
        })}
        <div className="px-3 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
          Review
        </div>
        {REVIEW.map((r) => (
          <button
            key={r}
            onClick={() => onStepClick?.(3)}
            className="w-full text-left px-3 py-1.5 text-sm border-b border-slate-100 last:border-b-0 text-slate-600 hover:bg-slate-50 border-l-4 border-l-transparent transition-colors"
          >
            {r}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-300 rounded-sm overflow-hidden text-xs">
        <div className="px-3 py-1.5 bg-zinc-700 text-white font-semibold text-sm">Order Summary</div>
        <div className="px-3 py-2 border-b border-slate-200">
          <p className="font-bold text-slate-900 truncate">{clientName || "No customer set"}</p>
          <p className="text-slate-500 truncate">Description: {description || "—"}</p>
        </div>
        <div className="px-3 py-2">
          {[
            ["Subtotal:", s.subtotal],
            ["Discount:", s.discount],
            ...(Number(s.contingency) > 0
              ? [[`Contingency${s.contingencyPct != null ? ` (${s.contingencyPct}%)` : ""}:`, s.contingency]]
              : []),
            ["Shipping:", s.shipping],
            ["Permits:", s.permits],
            ["New Subtotal:", s.newSubtotal],
            [`Tax (${Number(taxPercent || 0)}%):`, s.tax],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between gap-2 py-0.5 text-slate-700">
              <span>{label}</span>
              <span className="tabular-nums">{money(val)}</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 py-0.5 font-bold text-slate-900 border-t border-slate-300 mt-1 pt-1.5">
            <span>Total:</span>
            <span className="tabular-nums">{money(s.total)}</span>
          </div>
          {s.deposit != null && Number(s.deposit) > 0 && (
            <div className="flex justify-between gap-2 py-0.5 text-slate-700">
              <span>Deposit{s.depositPct != null ? ` (${s.depositPct}%)` : ""}:</span>
              <span className="tabular-nums">{money(s.deposit)}</span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onSaveProgress}
        disabled={saving || readOnly}
        className="w-full bg-lime-200 hover:bg-lime-300 disabled:opacity-60 border border-lime-500 text-slate-900 font-semibold py-2 rounded-sm text-sm transition-colors"
      >
        {readOnly ? "Protected · Revise to Edit" : saving ? "Saving…" : `Save Estimate Progress${dirty ? " *" : ""}`}
      </button>
    </div>
  );
}