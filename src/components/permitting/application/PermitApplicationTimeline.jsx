import { Check, X } from "lucide-react";
import { formatShortDate } from "./applicationTracking";
import { CcsDateField } from "@/components/ui/ccs-date-field";

// Drafted → Submitted → Acknowledged → Under review → Approved.
// Submitted comes from the workflow steps and Approved from the permit details,
// so only the three in-between stages are edited here.
export default function PermitApplicationTimeline({ stages, rejected, disabled, onSetDate }) {
  return (
    <div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {stages.map((stage) => {
          const reached = !!stage.date;
          return (
            <li key={stage.key} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${reached ? "border-emerald-400 bg-emerald-500 text-white" : "border-slate-300 bg-white text-slate-400"}`}>
                  {reached ? <Check className="h-3 w-3" /> : stage.index + 1}
                </span>
                <span className={`truncate text-[11px] font-semibold ${reached ? "text-slate-800" : "text-slate-500"}`}>{stage.label}</span>
              </div>
              {stage.editable ? (
                <CcsDateField
                  aria-label={`${stage.label} date`}
                  value={stage.date || ""}
                  disabled={disabled}
                  onChange={(event) => onSetDate(stage.field, event.target.value || null)}
                  className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs disabled:opacity-60"
                />
              ) : (
                <div className="mt-1 min-h-8 px-1 py-1.5 text-[10px] text-slate-500" title={stage.hint}>
                  {stage.date ? formatShortDate(stage.date) : stage.hint}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {rejected && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          <X className="h-3 w-3" /> Rejected {formatShortDate(rejected)}
        </div>
      )}
    </div>
  );
}