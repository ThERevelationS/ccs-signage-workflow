import { useEffect, useState } from "react";
import { History, Loader2, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";

import { ListSkeleton } from "@/components/ui/list-skeleton";

const TYPES = [
  { key: "", label: "All" },
  { key: "revision", label: "Estimate revisions" },
  { key: "activity", label: "Opportunity activity" },
];

// Unified admin audit log (#490): merges EstimateRevision + OpportunityActivity
// records into one reverse-chronological, type-filterable timeline so admins
// can trace cross-record changes in a single view instead of per-record panels.
export default function AuditLog() {
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState(null);
  const [type, setType] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { base44.auth.me().then(setMe).catch(() => setMe(false)); }, []);

  useEffect(() => {
    if (me?.role !== "admin") return;
    let live = true;
    const load = async () => {
      setError("");
      try {
        const [revisions, activities] = await Promise.all([
          type === "activity" ? Promise.resolve([]) : base44.entities.EstimateRevision.filter({}, "-updated_date", 150).catch(() => []),
          type === "revision" ? Promise.resolve([]) : base44.entities.OpportunityActivity.filter({}, "-created_date", 150).catch(() => []),
        ]);
        const rev = (Array.isArray(revisions) ? revisions : []).map((r) => ({
          id: `r-${r.id}`, ts: r?.updated_date || r?.created_date || "", kind: "revision",
          label: `Revision ${r?.revision_number ?? "?"}${r?.status ? ` · ${r.status}` : ""}`,
          body: `${r?.estimate_number || r?.estimate_id || ""}${r?.reason ? ` — ${r.reason}` : ""}${r?.created_by_email ? ` · by ${r.created_by_email}` : ""}`,
        }));
        const act = (Array.isArray(activities) ? activities : []).map((a) => ({
          id: `a-${a.id}`, ts: a?.created_date || "", kind: "activity",
          label: String(a?.event_type || "activity").replaceAll("_", " "),
          body: `${a?.summary || ""}${a?.opportunity_id ? ` · opp ${a.opportunity_id.slice(0, 8)}` : ""}`,
        }));
        if (live) setRows([...rev, ...act].sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 200));
      } catch (e) {
        if (live) { setError(e?.message || "Audit records could not be loaded."); setRows([]); }
      }
    };
    load();
    return () => { live = false; };
  }, [me, type]);

  if (me === null) return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  if (me?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-16 text-center">
        <ShieldAlert className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium text-gray-700">Admin only — the audit log is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 bg-white px-4 py-3">
          <History className="h-4 w-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">AUDIT LOG</h1>
          <span className="ml-auto text-xs text-gray-400">{rows?.length ?? 0} records</span>
        </div>
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button type="button" key={t.key} onClick={() => setType(t.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${type === t.key ? "bg-red-600 text-white border-red-600" : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {error && <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
        <div className="bg-white">
          {rows === null ? <ListSkeleton rows={10} /> : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">No audit records yet.</div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="flex gap-3 border-b border-gray-50 px-4 py-2.5 last:border-0">
                <span className="w-[135px] shrink-0 text-[10px] text-gray-400">{row.ts ? new Date(row.ts).toLocaleString() : ""}</span>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600">{row.label}</span>
                  <p className="truncate text-[11px] text-gray-700" title={row.body}>{row.body}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
