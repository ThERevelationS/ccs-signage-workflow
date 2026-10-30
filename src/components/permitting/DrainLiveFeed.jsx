import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Radio } from "lucide-react";
import { staffEntities } from "@/components/staff/staffEntities";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";

const Q = staffEntities.SourceCollectionQueue;
const POLL_MS = 60000;

const OUTCOME_STYLE = {
  sources_found: "text-green-700",
  partial_gaps: "text-amber-700",
  blocked: "text-red-700",
  verified_current: "text-emerald-700",
};

export default function DrainLiveFeed() {
  const [rows, setRows] = useState({ active: [], done: [], remaining: 0, total: 0 });
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if ((typeof document !== "undefined" && document.hidden) || isFleetCoolingDown()) return;
      try {
        const [inFlight, recent, remaining, total] = await Promise.all([
          Q.filter({ status: "source_discovery" }, "-updated_date", 25, 0),
          Q.filter({}, "-updated_date", 500, 0),
          Q.filter({ status: "not_started" }, undefined, 2000, 0),
          Q.filter({}, undefined, 1, 0),
        ]);
        if (stop) return;
        const done = (recent || [])
          .filter(r => ["sources_found","partial_gaps","blocked","verified_current"].includes(r.status) && r.research_dispatch_attempts > 0)
          .slice(0, 15);
        setRows({ active: inFlight || [], done, remaining: (remaining || []).length, total: 0 });
      } catch { /* poll again next tick */ }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <div className="clay-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Radio className="w-4 h-4 text-purple-600 animate-pulse" />
        <span className="text-sm font-semibold text-gray-800">Research drain — live</span>
        <span className="ml-auto text-xs text-gray-500">{rows.remaining} queued</span>
      </div>
      {rows.active.length > 0 && (
        <div className="mb-2 space-y-1">
          {rows.active.map(r => (
            <div key={r.id} className="flex items-center gap-2 text-xs text-purple-800">
              <Loader2 className="w-3 h-3 animate-spin" />
              {r.jurisdiction_name}, {r.state} ({r.jurisdiction_type})
              {Number.isFinite(r.dispatch_rank) && <span className="text-gray-400">{r.dispatch_rank} mi</span>}
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {rows.done.map(r => (
          <div key={r.id} className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${OUTCOME_STYLE[r.status] || "text-gray-600"}`}>{r.status.replace(/_/g, " ")}</span>
            <span className="text-gray-700 truncate">{r.jurisdiction_name}, {r.state}</span>
            <span className="ml-auto text-gray-400">{String(r.updated_date || "").slice(11, 19)}</span>
          </div>
        ))}
        {!rows.active.length && !rows.done.length && (
          <p className="text-xs text-gray-400">Waiting for research activity…</p>
        )}
      </div>
    </div>
  );
}