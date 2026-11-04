import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { History, RefreshCw } from "lucide-react";

// MP-11.1 — renders the locality's office_change_log (written by the
// office-diff worker): "what changed in this jurisdiction's permitting
// offices, and when". Self-fetches the PermitLocality for the open profile.
export default function OfficeChangeLog({ jurisdiction }) {
  const [log, setLog] = useState(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (!jurisdiction?.id) { setLog([]); return; }
      const locs = await base44.entities.PermitLocality.filter({ jurisdiction_profile_id: jurisdiction.id }).catch(() => []);
      const loc = (Array.isArray(locs) ? locs : [])[0];
      if (!dead) setLog(Array.isArray(loc?.office_change_log) ? loc.office_change_log : []);
    })();
    return () => { dead = true; };
  }, [jurisdiction?.id]);

  if (!log || log.length === 0) return null;

  const entries = [...log].reverse().slice(0, 8);
  const newest = new Date(entries[0]?.at || 0).getTime();
  const fresh = Date.now() - newest < 7 * 24 * 3600 * 1000;

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
