import { useMemo, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ListFilter, Search, ArrowUpDown, RotateCcw, Trash2, Download } from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { localDateStamp } from "@/components/estimator/quoteLifecycle";
import { restoreEstimateFromLoadedTrashSnapshot, permanentlyDeleteTrashedEstimate } from "@/components/estimator/estimatePersistence";
import { isEstimateStatusTransitionAllowed } from "@/components/estimator/estimateStatusTransitions";
import { staffEntities } from "@/components/staff/staffEntities";
import { useAuth } from "@/components/auth/EmailGate";
import SavedViews from "@/components/workflow/SavedViews";

const STATUSES = [
  { key: "", label: "All" },
  { key: "draft", label: "In Draft" },
  { key: "calculated", label: "Calculated" },
  { key: "sent", label: "Awaiting Approval" },
  { key: "approved", label: "Approved" },
  { key: "archived", label: "Archived" },
  { key: "cancelled", label: "Cancelled" },
  { key: "sync_issues", label: "Sync Issues" },
  { key: "trash", label: "Trash" },
];

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "value_desc", label: "$ high â†’ low" },
  { key: "expiring", label: "Expiring first" },
];

const csvCell = (value) => {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const downloadCsv = (filename, headers, rows) => {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const money0 = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const compact = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money0(n));
const today = () => localDateStamp();

function expiryOf(e) {
  const override = String(e?.quote_expiration_date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(override)) return override;
  const validDays = e.quote_valid_days ?? e.valid_days;
  if ((e.status || "draft") !== "sent" || !e.quote_issue_date || !validDays) return null;
  const d = new Date(e.quote_issue_date);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(validDays));
  return localDateStamp(d);
}

// The EXPIRED badge is computed at read, but reporting needs a persisted
// flag — sweep a bounded slice of stale rows each load so `quote_expired`
// stays a truthful filter without a dedicated cron job.
const EXPIRY_FLAG_SWEEP_LIMIT = 10;
function syncExpiredFlags(rows) {
  const now = today();
  const stale = (Array.isArray(rows) ? rows : []).filter((e) => {
    const expired = Boolean(expiryOf(e) && expiryOf(e) < now);
    return Boolean(e?.id) && expired !== (e?.quote_expired === true);
  }).slice(0, EXPIRY_FLAG_SWEEP_LIMIT);
  for (const e of stale) {
    const expired = Boolean(expiryOf(e) && expiryOf(e) < now);
    staffEntities.AllInOneEstimate.update(e.id, { quote_expired: expired }).catch(() => {});
  }
}

function daysSince(dateStr) {
  const d = Date.parse(dateStr || "");
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}

const TAG_DOT = { red: "bg-red-500", amber: "bg-amber-400", green: "bg-emerald-500", blue: "bg-sky-500", violet: "bg-violet-500" };

export default function EstimatorQueues() {
  const { user } = useAuth();
  const myEmail = String(user?.email || "").trim().toLowerCase();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const status = params.get("status") || "";
  // ?mine=1 scopes every bucket to the signed-in user's estimates.
  // Queues default to all rows; this is the admin "my estimates" toggle.
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(params.get("q") || "");
  const [sort, setSort] = useState(params.get("sort") || "newest");
  const [trashBusyId, setTrashBusyId] = useState("");
  const [trashError, setTrashError] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkStatus, setBulkStatus] = useState("sent");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const mine = params.get("mine") === "1";
  const [me, setMe] = useState(null);
  useEffect(() => { base44.auth.me().then(setMe).catch(() => {}); }, []);

  const toggleSelected = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const applyBulkStatus = async () => {
    if (!selectedIds.size || bulkBusy) return;
    setBulkBusy(true); setBulkError("");
    const failures = [];
    const skipped = [];
    for (const id of selectedIds) {
      const row = estimates.find((e) => e.id === id);
      if (!isEstimateStatusTransitionAllowed(row?.status, bulkStatus)) {
        skipped.push(`${row?.estimate_number || id} (${row?.status || "draft"} → ${bulkStatus})`);
        continue;
      }
      try {
        await staffEntities.AllInOneEstimate.update(id, { status: bulkStatus });
      } catch (error) {
        failures.push(`${id}: ${error?.message || "update failed"}`);
      }
    }
    setBulkBusy(false);
    setSelectedIds(new Set());
    const notes = [];
    if (skipped.length) notes.push(`${skipped.length} skipped — status change not allowed: ${skipped.slice(0, 3).join(" · ")}${skipped.length > 3 ? ` (+${skipped.length - 3} more)` : ""}`);
    if (failures.length) notes.push(`Bulk update partially failed: ${failures.slice(0, 3).join(" · ")}${failures.length > 3 ? ` (+${failures.length - 3} more)` : ""}`);
    if (notes.length) setBulkError(notes.join(" "));
    try { const reloaded = await loadAllEntityRows({ entity: base44.entities.AllInOneEstimate, sort: "-created_date", label: "Estimator queue" }); setEstimates(reloaded); } catch {}
  };

  const writeParams = (key, value) => {
    try {
      const next = new URLSearchParams(window.location.search);
      if (value && value !== "newest") next.set(key, value); else next.delete(key);
      window.history.replaceState(null, "", `${window.location.pathname}?${next}`);
    } catch {}
  };

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await loadAllEntityRows({
          entity: staffEntities.AllInOneEstimate,
          sort: "-created_date",
          label: "Estimate queues",
        });
        setEstimates(rows);
        syncExpiredFlags(rows);
      } catch (err) {
        console.error("Estimate queues could not be loaded:", err);
        setLoadError(err?.message || "Estimates could not be loaded.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleRestore = async (e) => {
    if (trashBusyId) return;
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      const saved = await restoreEstimateFromLoadedTrashSnapshot({
        entity: staffEntities.AllInOneEstimate,
        estimate: e,
        label: "Estimate Trash recovery",
      });
      setEstimates((prev) => prev.map((row) => (row.id === e.id ? saved : row)));
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be restored. Reload Trash before retrying.");
    } finally {
      setTrashBusyId("");
    }
  };

  const handlePermanentDelete = async (e) => {
    if (trashBusyId) return;
    const acceptances = await base44.entities.EstimateAcceptance
      .filter({ estimate_id: e.id }, "-created_date", 5)
      .catch(() => []);
    const linked = [];
    if (e.work_order_id) linked.push("a linked Work Order");
    if (Array.isArray(acceptances) && acceptances.length) {
      linked.push(`${acceptances.length} recorded customer acceptance${acceptances.length === 1 ? "" : "s"}`);
    }
    const cascade = linked.length
      ? `\n\nWARNING: this estimate has ${linked.join(" and ")}. Linked records are NOT deleted automatically and will keep pointing at a removed estimate.`
      : "";
    if (!window.confirm(`Permanently delete â€” this cannot be undone${cascade}`)) return;
    setTrashBusyId(e.id);
    setTrashError("");
    try {
      await permanentlyDeleteTrashedEstimate({
        entity: staffEntities.AllInOneEstimate,
        estimate: e,
        label: "Estimate Trash permanent delete",
      });
      setEstimates((prev) => prev.filter((row) => row.id !== e.id));
    } catch (err) {
      setTrashError(err?.message || "The estimate could not be permanently deleted. Reload Trash before retrying.");
    } finally {
      setTrashBusyId("");
    }
  };

  const buckets = useMemo(() => {
    const by = {};
    for (const s of STATUSES) by[s.key] = { count: 0, total: 0 };
    for (const e of estimates) {
      if (e?.deleted === true) {
        by.trash.count += 1;
        by.trash.total += Number(e.quote_total || e.total_cost || 0);
        continue;
      }
      const bucketKey = e.pipeline_sync_pending === true ? "sync_issues" : (e.status || "draft");
      if (by[bucketKey]) { by[bucketKey].count += 1; by[bucketKey].total += Number(e.quote_total || e.total_cost || 0); }
      by[""].count += 1;
      by[""].total += Number(e.quote_total || e.total_cost || 0);
    }
    return by;
  }, [estimates]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    let list = status === "trash"
      ? estimates.filter((e) => e?.deleted === true)
      : status === "sync_issues"
        ? estimates.filter((e) => e?.deleted !== true && e.pipeline_sync_pending === true)
        : status
          ? estimates.filter((e) => e?.deleted !== true && (e.status || "draft") === status)
          : estimates.filter((e) => e?.deleted !== true);
    if (mine && me?.email) {
      const mineEmail = String(me.email).toLowerCase();
      list = list.filter((e) => String(e.salesperson_email || e.created_by || "").toLowerCase() === mineEmail);
    }
    if (q) {
      list = list.filter((e) =>
        [e.project_name, e.client_name, e.estimate_number, e.notes, e.estimate_notes, e.contact_name, e.project_address, e.site_address,
         ...(Array.isArray(e.line_items) ? e.line_items.map((l) => [l.name, l.product_name, l.description].join(" ")) : [])
        ].some((v) => String(v || "").toLowerCase().includes(q)));
    }
    const val = (e) => Number(e.quote_total || e.total_cost || 0);
    const exp = (e) => expiryOf(e) || "9999-12-31";
    const sorted = [...list];
    if (sort === "oldest") sorted.sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
    else if (sort === "value_desc") sorted.sort((a, b) => val(b) - val(a));
    else if (sort === "expiring") sorted.sort((a, b) => exp(a).localeCompare(exp(b)));
    else sorted.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
    return sorted;
  }, [estimates, status, q, sort, mine, me]);

  const visibleTotal = rows.reduce((s, e) => s + Number(e.quote_total || e.total_cost || 0), 0);

  const exportCsv = () => {
    downloadCsv("estimates.csv",
      ["Estimate #", "Project", "Customer", "Status", "Quote Total", "Cost Total", "Salesperson", "Source", "Updated", "Due Date"],
      rows.map((e) => [
        e.estimate_number || e.job_name || "",
        e.project_name || "",
        e.client_name || "",
        e.status || "",
        e.quote_total ?? "",
        e.cost_total ?? "",
        e.salesperson_email || e.created_by || "",
        e.source_module || "",
        e.updated_date || "",
        e.due_date || "",
      ]));
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">ESTIMATE QUEUES</h1>
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className="ml-auto h-6 px-2 rounded border border-gray-300 bg-white text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"><Download className="w-3 h-3" /> CSV</button>
          <span className="text-xs text-gray-400">{rows.length} shown Â· {compact(visibleTotal)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => {
            const b = buckets[s.key] || { count: 0, total: 0 };
            return (
              <Link
                key={s.key || "all"}
                to={`/EstimatorQueues?${(() => { const p = new URLSearchParams(); if (s.key) p.set("status", s.key); if (q) p.set("q", q); if (sort && sort !== "newest") p.set("sort", sort); if (mine) p.set("mine", "1"); return p.toString(); })()}`}
                aria-current={status === s.key ? "true" : undefined}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  status === s.key
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"
                }`}
                title={`${b.count} Â· ${money0(b.total)}`}
              >
                {s.label}
                <span className={`ml-1.5 ${status === s.key ? "text-red-100" : "text-gray-400"}`}>
                  {b.count}{b.total > 0 ? ` Â· ${compact(b.total)}` : ""}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => { const v = e.target.value; setQuery(v); writeParams("q", v); }}
              placeholder="Search project, client, or estimate #â€¦"
              className="w-full rounded-lg border border-gray-200 bg-white/80 py-2 pl-9 pr-3 text-sm outline-none focus:border-red-300"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
            <select
              value={sort}
              onChange={(e) => { const v = e.target.value; setSort(v); writeParams("sort", v); }}
              className="rounded-lg border border-gray-200 bg-white/80 px-2 py-2 text-xs font-semibold text-gray-600 outline-none focus:border-red-300"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <SavedViews
            storageKey="views.estimator_queues"
            getState={() => ({ q: query, status, sort })}
            onApply={(s) => {
              const nextQ = s?.q || ""; const nextSort = s?.sort || "newest"; const nextStatus = s?.status || "";
              setQuery(nextQ); setSort(nextSort);
              const p = new URLSearchParams();
              if (nextStatus) p.set("status", nextStatus);
              if (nextQ) p.set("q", nextQ);
              if (nextSort !== "newest") p.set("sort", nextSort);
              navigate(`/EstimatorQueues${p.size ? `?${p.toString()}` : ""}`, { replace: true });
            }}
          />
        </div>

        {trashError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 flex items-center justify-between gap-3">
            <span>{trashError}</span>
            <button type="button" onClick={() => setTrashError("")} className="text-red-500 font-bold">Dismiss</button>
          </div>
        )}

        <div className="bg-white">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loadingâ€¦</div>
          ) : loadError ? (
            <div className="px-4 py-10 text-center text-sm text-red-600">{loadError}</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Nothing in this queue.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50/60 border-b border-red-100">
                  <span className="text-[11px] font-bold text-red-700">{selectedIds.size} selected</span>
                  <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="h-7 rounded border border-gray-300 bg-white px-2 text-[11px] font-semibold text-gray-700">
                    {["draft", "calculated", "sent", "approved", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" onClick={applyBulkStatus} disabled={bulkBusy} className="h-7 px-3 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-50">{bulkBusy ? "Applyingâ€¦" : "Apply status"}</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="h-7 px-2 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600 hover:border-red-300">Clear</button>
                  {bulkError && <span className="text-[10px] text-red-600">{bulkError}</span>}
                </div>
              )}
              {rows.map((e) => {
                const expires = expiryOf(e);
                const expired = expires && expires < today();
                const expiringSoon = expires && !expired && expires <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                const age = daysSince(e.updated_date || e.created_date);
                if (status === "trash") {
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/EstimateDetail?id=${e.id}`}
                          className="text-sm font-semibold text-gray-800 truncate hover:text-red-600 block"
                        >
                          {e.project_name}
                        </Link>
                        <div className="text-xs text-gray-500 truncate">
                          {e.client_name}
                          {e.estimate_number ? ` Â· ${e.estimate_number}` : ""}
                          {e.priority && e.priority !== "normal" ? ` · ${String(e.priority).toUpperCase()} PRIORITY` : ""}
                          {e.deleted_at ? ` Â· deleted ${format(new Date(e.deleted_at), "MMM d")}` : ""}
                          {e.deleted_by ? ` by ${e.deleted_by}` : ""}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-gray-800 w-24 text-right flex-shrink-0">
                        {money0(e.quote_total || e.total_cost)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRestore(e)}
                          disabled={!!trashBusyId}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermanentDelete(e)}
                          disabled={!!trashBusyId}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700 hover:border-red-300 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" /> Delete permanently
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={e.id} className="flex items-center gap-2 px-4 py-3 hover:bg-red-50/50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggleSelected(e.id)}
                      aria-label={`Select ${e.project_name || "estimate"}`}
                      className="w-4 h-4 shrink-0 accent-red-600"
                    />
                    <Link
                      to={`/EstimateDetail?id=${e.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">{myEmail && e.personal_tags?.[myEmail]?.color ? <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${TAG_DOT[e.personal_tags[myEmail].color] || ""}`} title={`My label: ${e.personal_tags[myEmail].color}`} /> : null}{e.project_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {e.client_name}
                        {e.estimate_number ? ` Â· ${e.estimate_number}` : ""}
                          {e.priority && e.priority !== "normal" ? ` · ${String(e.priority).toUpperCase()} PRIORITY` : ""}
                        {age != null ? ` Â· ${age}d open` : ""}
                        {e.status === "archived" && e.archived_reason ? ` · ${e.archived_reason}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {expired && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">EXPIRED</span>}
                      {!expired && e.status === "sent" && age != null && age >= 7 && <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5" title={`Sent ${age} days ago without a response`}>FOLLOW UP</span>}
                      {expiringSoon && <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">EXPIRES {format(new Date(expires), "MMM d")}</span>}
                      {e.pipeline_sync_pending && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">SYNC ISSUE</span>}
                      <span className="text-xs font-medium text-gray-500 capitalize">
                        {e.status || "draft"}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-gray-800 w-24 text-right flex-shrink-0">
                      {money0(e.quote_total || e.total_cost)}
                    </div>
                    <div className="text-xs text-gray-400 w-16 text-right hidden sm:block flex-shrink-0">
                      {e.created_date ? format(new Date(e.created_date), "MMM d") : ""}
                    </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}