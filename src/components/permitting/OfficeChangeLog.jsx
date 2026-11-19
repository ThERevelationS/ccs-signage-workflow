import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { History, RefreshCw } from "lucide-react";

// MP-11.1 — renders the locality's office_change_log (written by the
// office-diff worker): "what changed in this jurisdiction's permitting
// offices, and when". Self-fetches the PermitLocality for the open profile.
export default function OfficeChangeLog({ jurisdiction }) {
  const [log, setLog] = useState(null);
  const [observed, setObserved] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!jurisdiction?.id) { setLog([]); setObserved(null); return; }
      const locs = await base44.entities.PermitLocality.filter({ jurisdiction_profile_id: jurisdiction.id }).catch(() => []);
      const loc = (Array.isArray(locs) ? locs : [])[0];
      if (dead) return;
      setLog(Array.isArray(loc?.office_change_log) ? loc.office_change_log : []);
      setObserved(loc?.observed_outcomes && loc.observed_outcomes.permits_observed ? loc.observed_outcomes : null);
    })();
    return () => { dead = true; };
  }, [jurisdiction?.id]);

  const hasLog = log && log.length > 0;
  if (!hasLog && !observed) return null;

  const entries = hasLog ? [...log].reverse().slice(0, 8) : [];
  const newest = new Date(entries[0]?.at || 0).getTime();
  const fresh = newest && Date.now() - newest < 7 * 24 * 3600 * 1000;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <History className="w-3.5 h-3.5" />
        Office changes detected by research
        {fresh && (
          <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
            <RefreshCw className="w-2.5 h-2.5" /> this week
          </span>
        )}
      </p>
      {observed && (
        <p className="mb-2 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
          Observed from {observed.permits_observed} filed permit{observed.permits_observed === 1 ? "" : "s"}:{" "}
          {observed.avg_decision_days != null && <>{observed.avg_decision_days}d avg decision · </>}
          {observed.fee_avg != null && <>avg fee ${observed.fee_avg}</>}
          {observed.fee_min != null && observed.fee_max != null && observed.fee_min !== observed.fee_max && <> (${observed.fee_min}–${observed.fee_max})</>}
          {observed.denial_count > 0 && <> · {observed.denial_count} denial{observed.denial_count === 1 ? "" : "s"}</>}
        </p>
      )}
      <ul className="space-y-1">
        {entries.map((e, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[11px] leading-snug">
            <span className="shrink-0 tabular-nums text-slate-400">
              {e.at ? new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
            </span>
            <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">
              {e.summary || "office data updated"}
              {typeof e.verified_count === "number" && (
                <span className="text-slate-400"> · {e.verified_count} verified</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
