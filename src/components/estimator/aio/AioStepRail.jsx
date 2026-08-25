import React from "react";

const STEPS = [
  { step: "Step 1", label: "Estimate Details" },
  { step: "Step 2", label: "Edit Products" },
  { step: "Step 3", label: "Finalize Estimate" },
];

const REVIEW = ["Cost Summary", "Bill of Materials"];

export default function AioStepRail({
  activeStep = 1,
  onStepClick,
  clientName,
  description,
  taxPercent = 0,
  onSaveProgress,
  saving,
}) {
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  return (
    <div className="w-[190px] flex-shrink-0 space-y-3">
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="bg-gray-800 text-white text-[10px] font-bold tracking-wider px-3 py-1.5">
          ESTIMATE — NEW
        </div>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const active = n === activeStep;
          return (
            <button
              key={s.label}
              onClick={() => onStepClick?.(n)}
              className={`w-full text-left px-3 py-2 border-b border-gray-100 ${
                active ? "bg-lime-100" : "hover:bg-gray-50"
              }`}
            >
              <div className="text-[11px] font-bold text-gray-700">{s.step}</div>
              <div className="text-[12px] text-gray-600">{s.label}</div>
            </button>
          );
        })}
        <div className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wider text-gray-400">
          REVIEW
        </div>
        {REVIEW.map((r) => (
          <div key={r} className="px-3 py-2 text-[12px] text-gray-600 hover:bg-gray-50">
            {r}
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="bg-gray-800 text-white text-[11px] font-bold px-3 py-1.5">Order Summary</div>
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-[12px] font-semibold text-gray-700">
            {clientName || "No customer set"}
          </div>
          <div className="text-[11px] text-gray-400">Description: {description || "—"}</div>
        </div>
        <div className="px-3 py-2 space-y-1 text-[11px] text-gray-600">
          {[
            ["Subtotal", 0],
            ["Discount", 0],
            ["Shipping", 0],
            ["Permits", 0],
            ["New Subtotal", 0],
            [`Tax (${Number(taxPercent || 0)}%)`, 0],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span>{label}:</span>
              <span>{money(val)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-1 border-t border-gray-200 font-bold text-gray-800">
            <span>Total:</span>
            <span>{money(0)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={onSaveProgress}
        disabled={saving}
        className="w-full py-2 rounded bg-lime-200 hover:bg-lime-300 text-[12px] font-semibold text-gray-800 border border-lime-300 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save Estimate Progress *"}
      </button>
    </div>
  );
}