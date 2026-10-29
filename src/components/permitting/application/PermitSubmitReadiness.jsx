import { AlertTriangle, BadgeCheck } from "lucide-react";

export default function PermitSubmitReadiness({ readiness }) {
  if (readiness.submitted) return null;
  if (readiness.ready) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
        <BadgeCheck className="h-3.5 w-3.5" /> Ready to submit — every listed document is checked off.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" /> Not ready to submit yet
      </div>
      <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-700">
        {readiness.missing.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}
        {readiness.missing.length > 4 && <li>• +{readiness.missing.length - 4} more</li>}
      </ul>
    </div>
  );
}