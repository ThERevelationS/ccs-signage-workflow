import React from "react";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export default function HoldDownAdvisor({ advice }) {
  if (!advice) return null;
  const warn = advice.needed;
  return (
    <div
      className={`rounded-lg p-3 text-xs border ${
        warn ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-emerald-50 border-emerald-200 text-emerald-900"
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold mb-1">
        {warn ? <AlertTriangle className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
        Hold-Down Advisor
      </div>
      <p>{advice.recommendation}</p>
      {advice.reasons.length > 0 && (
        <ul className="list-disc list-inside mt-1 space-y-0.5 opacity-80">
          {advice.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {advice.extra_hours > 0 && (
        <p className="mt-1 opacity-80">+{advice.extra_hours.toFixed(2)} hr added setup</p>
      )}
    </div>
  );
}