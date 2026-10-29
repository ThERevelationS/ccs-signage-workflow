import { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Unified cross-system activity log for one estimate (#350): merges the
// opportunity-level activity rows tied to this estimate with its portal
// message records into a single reverse-chronological timeline.
export default function EstimateActivityPanel({ estimate, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      setError("");
      try {
        const estimateId = estimate?.id;
        if (!estimateId) { setRows([]); return; }
        const [activities, messages] = await Promise.all([
          estimate?.opportunity_id
            ? base44.entities.OpportunityActivity.filter({ opportunity_id: estimate.opportunity_id }, "-created_date", 100).catch(() => [])
            : Promise.resolve([]),
          base44.entities.PortalMessage.filter({ related_kind: "estimate", related_id: estimateId }, "-created_date", 100).catch(() => []),
        ]);
        const activityRows = (Array.isArray(activities) ? activities : [])
          .filter((a) => {
            const d = a?.details || {};
            return !d.estimate_id || String(d.estimate_id) === String(estimateId);
          })
          .map((a) => ({
            id: `a-${a.id}`,
            ts: a?.created_date || "",
            label: String(a?.event_type || "activity").replaceAll("_", " "),
            body: a?.summary || "",
          }));
        const messageRows = (Array.isArray(messages) ? messages : []).map((m) => ({
          id: `m-${m.id}`,
          ts: m?.created_date || "",
          label: `${m?.author_side === "customer" ? "Customer" : "Staff"} ${String(m?.kind || "message").replaceAll("_", " ")}`,
          body: m?.body || "",
        }));
        if (live) setRows([...activityRows, ...messageRows].sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 25));
      } catch (e) {
        if (live) { setError(e?.message || "Activity could not be loaded."); setRows([]); }
      }
    };
    load();
    return () => { live = false; };
  }, [estimate?.id, estimate?.opportunity_id, refreshKey]);

  if (!estimate?.id) return null;
  return (
    <div className="bg-white rounded-md border border-gray-200 p-4">
      <h3 className="text-xs font-bold tracking-wide text-gray-600 flex items-center gap-1.5">
        <History className="h-3.5 w-3.5 text-gray-400" /> ACTIVITY LOG
      </h3>
      {error && <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
      {rows === null ? (
        <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading activity…</div>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[11px] text-gray-400">No activity recorded for this estimate yet.</p>
      ) : (
        <div className="mt-3 max-h-72 space-y-0 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="flex gap-3 border-b border-gray-50 py-2 last:border-0">
              <span className="w-[120px] shrink-0 text-[10px] text-gray-400">{row.ts ? new Date(row.ts).toLocaleString() : ""}</span>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600">{row.label}</span>
                <p className="truncate text-[11px] text-gray-700" title={row.body}>{row.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
