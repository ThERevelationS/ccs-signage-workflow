
const SECTIONS = [
  { n: 1, key: "details", label: "Details", description: "Customer & job information" },
  { n: 2, key: "build", label: "Products & Parts", description: "Build, price & organize products" },
  { n: 3, key: "customer", label: "Pricing & Finalize", description: "Review, quote, approve & convert" },
];

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
        {SECTIONS.map((section) => {
          const active = section.n === activeStep;
          return (
            <button type="button"
              key={section.key}
              onClick={() => onStepClick?.(section.n)}
              aria-current={active ? "step" : undefined}
              className={`w-full text-left px-3 py-2.5 border-b border-slate-200 last:border-b-0 transition-colors ${
                active
                  ? "bg-lime-100 border-l-4 border-l-lime-600"
                  : "bg-slate-50 hover:bg-slate-100 border-l-4 border-l-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[13px] font-bold ${active ? "text-slate-950" : "text-slate-800"}`}>
                  {section.label}
                </p>
                {done[section.n] && <span className="text-lime-700 text-xs" title="Section complete">✔</span>}
              </div>
              <p className="text-[10px] leading-4 text-slate-500 mt-0.5">{section.description}</p>
            </button>
          );
        })}
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

      <button type="button"
        onClick={onSaveProgress}
        disabled={saving || readOnly}
        className="w-full bg-lime-200 hover:bg-lime-300 disabled:opacity-60 border border-lime-500 text-slate-900 font-semibold py-2 rounded-sm text-sm transition-colors"
      >
        {readOnly ? "Protected · Revise to Edit" : saving ? "Saving…" : `Save Estimate Progress${dirty ? " *" : ""}`}
      </button>
    </div>
  );
}