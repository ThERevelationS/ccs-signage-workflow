import { useEffect, useRef, useState } from "react";
import { History, Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { useWorkspacePreferences } from "@/components/layout/WorkspacePreferencesProvider";
import { formatInUserTz } from "./userDateDisplay";

const TYPES = [
  { key: "", label: "All" },
  { key: "revision", label: "Estimate revisions" },
  { key: "activity", label: "Opportunity activity" },
  { key: "admin", label: "Admin actions" },
];

// #490 — unified admin audit log embedded in Estimator Settings: merges
// EstimateRevision + OpportunityActivity + AdminAuditLog into one
// reverse-chronological, type-filterable timeline (admins only).
// #481 — the active type filter can be saved as the signed-in user's default
// view (UserWorkspacePreferences.pageViews.audit_log) and is re-applied on
// the next visit.
// #488 — timestamps render through formatInUserTz so the viewer's per-user
// (or company) timezone preference is honored.
export default function EstimatorAuditPanel() {
  const { prefs, updatePrefs } = useWorkspacePreferences();
  const [rows, setRows] = useState(null);
  const [capped, setCapped] = useState(false);
  const [type, setType] = useState(() => String(prefs?.pageViews?.audit_log || ""));
  const [error, setError] = useState("");
  const [prefApplied, setPrefApplied] = useState(() => Boolean(prefs?.pageViews?.audit_log));
  const [degraded, setDegraded] = useState([]);
  const touchedRef = useRef(false);

  // Server prefs hydrate after mount — apply the saved default view once,
  // unless the user already picked a filter manually.
  const myDefault = String(prefs?.pageViews?.audit_log || "");
  useEffect(() => {
    if (touchedRef.current || !myDefault) return;
    setType((cur) => (cur === myDefault ? cur : myDefault));
    setPrefApplied(true);
  }, [myDefault]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      setError("");
      setDegraded([]);
      const FAILED = Symbol("feed-failed");
      const feed = (name, promise) => promise.catch(() => FAILED).then((r) => {
        if (r === FAILED && live) setDegraded((d) => [...d, name]);
        return r === FAILED ? [] : r;
      });
      try {
        const [revisions, activities, adminRows] = await Promise.all([
          type === "activity" || type === "admin" ? Promise.resolve([]) : feed("Estimate revisions", base44.entities.EstimateRevision.filter({}, "-updated_date", 150)),
          type === "revision" || type === "admin" ? Promise.resolve([]) : feed("Opportunity activity", base44.entities.OpportunityActivity.filter({}, "-created_date", 150)),
          // AdminAuditLog is not in the base44Client read-proxy set — it must
          // go through staffEntities (staffDataRead ADMIN_READABLE, admin role
          // re-checked server-side; the panel itself mounts only for admins).
          type === "revision" || type === "activity" ? Promise.resolve([]) : feed("Admin audit log", staffEntities.AdminAuditLog.filter({}, "-at", 150)),
        ]);
        const rev = (Array.isArray(revisions) ? revisions : []).map((r) => ({
          id: `r-${r.id}`, ts: r?.updated_date || r?.created_date || "", kind: "revision",
          label: `Revision ${r?.revision_number ?? "?"}${r?.status ? ` · ${r.status}` : ""}`,
          body: `${r?.estimate_number || r?.estimate_id || ""}${r?.reason ? ` — ${r.reason}` : ""}${r?.created_by_email ? ` · by ${r.created_by_email}` : ""}`,
        }));
        const act = (Array.isArray(activities) ? activities : []).map((a) => ({
          id: `a-${a.id}`, ts: a?.created_date || "", kind: "activity",
          label: String(a?.event_type || "activity").replaceAll("_", " "),
          body: `${a?.summary || ""}${a?.opportunity_id ? ` · opp ${String(a.opportunity_id).slice(0, 8)}` : ""}`,
        }));
        const adm = (Array.isArray(adminRows) ? adminRows : []).map((a) => ({
          id: `d-${a.id}`, ts: a?.at || a?.created_date || "", kind: "admin",
          label: String(a?.action || "admin action").replaceAll("_", " "),
          body: `${a?.detail || ""}${a?.actor_email ? ` · by ${a.actor_email}` : ""}${a?.target_email ? ` → ${a.target_email}` : ""}`,
        }));
        const merged = [...rev, ...act, ...adm].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
        if (live) {
          setRows(merged.slice(0, 200));
          setCapped((revisions?.length || 0) >= 150 || (activities?.length || 0) >= 150 || (adminRows?.length || 0) >= 150 || merged.length > 200);
        }
      } catch (e) {
        if (live) { setError(e?.message || "Audit records could not be loaded."); setRows([]); }
      }
    };
    load();
    return () => { live = false; };
  }, [type]);

  const saveDefault = () => {
    touchedRef.current = true;
    updatePrefs("pageViews.audit_log", type || "");
    setPrefApplied(Boolean(type));
  };

  return (
    <div className="bg-white px-4 py-4 border-t-4 border-violet-300">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-red-500" aria-hidden="true" />
        <div className="text-xs font-bold tracking-wide text-gray-600">ADMIN AUDIT LOG</div>
        <span className="ml-auto text-[10px] text-gray-400">{rows?.length ?? 0} records{capped ? " · newest only (capped)" : ""}</span>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">Who changed what, when — estimate revisions, opportunity activity and admin actions in one read-only timeline.</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {TYPES.map((t) => (
          <button type="button" key={t.key} onClick={() => { touchedRef.current = true; setType(t.key); }}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${type === t.key ? "bg-red-600 text-white border-red-600" : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"}`}>
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={saveDefault}
          title={myDefault === type && type ? "This filter is already your default" : "Save this filter as your default view for the audit log"}
          className={`ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold ${myDefault === (type || "") && (type || myDefault) ? "border-amber-300 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-500 hover:border-amber-300"}`}
        >
          <Star className={`w-3 h-3 ${myDefault === type && type ? "fill-amber-400 text-amber-500" : ""}`} aria-hidden="true" />
          {type && myDefault === type ? "Your default" : type ? "Make default" : myDefault ? "Clear default" : "Make default"}
        </button>
      </div>
      {prefApplied && myDefault && type === myDefault && (
        <div className="mt-1 text-[9px] text-amber-600">Showing your saved default view ({TYPES.find((t) => t.key === myDefault)?.label || myDefault}).</div>
      )}

      {error && <div role="alert" className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
      {degraded.length > 0 && (
        <div role="status" className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
          Degraded feed — {degraded.join(", ")} could not be loaded; the timeline below may be incomplete. Refresh to retry.
        </div>
      )}
      <div className="mt-2 border border-gray-200 rounded">
        {rows === null ? <ListSkeleton rows={8} /> : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-gray-400">No audit records yet.</div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {rows.map((row) => (
              <div key={row.id} className="flex gap-3 px-3 py-2">
                <span className="w-[140px] shrink-0 text-[10px] text-gray-400" title={row.ts ? `${row.ts} (shown in your timezone)` : ""}>
                  {row.ts ? formatInUserTz(row.ts, prefs, "", "datetime") : ""}
                </span>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-violet-600">{row.label}</span>
                  <p className="truncate text-[11px] text-gray-700" title={row.body}>{row.body}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}