import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PermitApplicationTimeline from "./PermitApplicationTimeline";
import PermitRequiredDocuments from "./PermitRequiredDocuments";
import PermitSubmitReadiness from "./PermitSubmitReadiness";
import { SUBMISSION_METHODS, getApplicationStages, getSubmitReadiness } from "./applicationTracking";

const label = "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500";

export default function PermitApplicationTracker({ lineItem, disabled, update }) {
  const stages = useMemo(() => getApplicationStages(lineItem), [lineItem]);
  const readiness = useMemo(() => getSubmitReadiness(lineItem), [lineItem]);
  const [reason, setReason] = useState(lineItem.rejection_reason || "");
  useEffect(() => setReason(lineItem.rejection_reason || ""), [lineItem.rejection_reason]);

  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Application</span>
        <span className="text-[10px] text-slate-500">Where the application stands, how it went in, and what it still needs.</span>
      </div>

      <PermitApplicationTimeline stages={stages} rejected={lineItem.rejected_date} disabled={disabled} onSetDate={update} />

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="block min-w-0">
            <span className={label}>How it was submitted</span>
            <Select value={lineItem.submission_method || "__none__"} onValueChange={(value) => update("submission_method", value === "__none__" ? null : value)} disabled={disabled}>
              <SelectTrigger className="h-8 bg-white text-xs"><SelectValue placeholder="Not recorded" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not recorded</SelectItem>
                {SUBMISSION_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <PermitSubmitReadiness readiness={readiness} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr]">
            <label className="min-w-0">
              <span className={label}>Rejected on</span>
              <input type="date" value={lineItem.rejected_date || ""} disabled={disabled} onChange={(event) => update("rejected_date", event.target.value || null)} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs disabled:opacity-60" />
            </label>
            <label className="min-w-0">
              <span className={label}>Office's reason for rejecting</span>
              <input
                value={reason}
                disabled={disabled}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => { if (reason.trim() !== (lineItem.rejection_reason || "")) update("rejection_reason", reason.trim() || null); }}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                placeholder="e.g. Missing setback dimensions on site plan"
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs disabled:opacity-60"
              />
            </label>
          </div>
        </div>
        <PermitRequiredDocuments lineItem={lineItem} disabled={disabled} onChange={(next) => update("required_documents", next)} />
      </div>
    </div>
  );
}