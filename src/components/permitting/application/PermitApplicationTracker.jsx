import { useMemo } from "react";
import PermitApplicationTimeline from "./PermitApplicationTimeline";
import PermitRequiredDocuments from "./PermitRequiredDocuments";
import PermitSubmitReadiness from "./PermitSubmitReadiness";
import { getApplicationStages, getSubmitReadiness } from "./applicationTracking";

// Submission method and denial are edited in the permit details above; this
// panel adds the stage timeline, the documents checklist and the ready gate.
export default function PermitApplicationTracker({ lineItem, disabled, update }) {
  const stages = useMemo(() => getApplicationStages(lineItem), [lineItem]);
  const readiness = useMemo(() => getSubmitReadiness(lineItem), [lineItem]);

  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Application</span>
        <span className="text-[10px] text-slate-500">Where the application stands and what it still needs.</span>
      </div>
      <PermitApplicationTimeline stages={stages} rejected={lineItem.denial_date} disabled={disabled} onSetDate={update} />
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PermitRequiredDocuments lineItem={lineItem} disabled={disabled} onChange={(next) => update("required_documents", next)} />
        <PermitSubmitReadiness readiness={readiness} />
      </div>
    </div>
  );
}