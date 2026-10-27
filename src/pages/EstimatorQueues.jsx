import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ListFilter, Search, ArrowUpDown } from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const STATUSES = [
  { key: "", label: "All" },
  { key: "draft", label: "In Draft" },
  { key: "calculated", label: "Calculated" },
  { key: "sent", label: "Awaiting Approval" },
  { key: "approved", label: "Approved" },
  { key: "archived", label: "Archived" },
  { key: "cancelled", label: "Cancelled" },
  { key: "sync_issues", label: "Sync Issues" },
];

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "value_desc", label: "$ high → low" },
  { key: "expiring", label: "Expiring first" },
];

const money0 = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const compact = (n) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money0(n));
const today = () => new Date().toISOString().slice(0, 10);

function expiryOf(e) {
  if ((e.status || "draft") !== "sent" || !e.quote_issue_date || !e.valid_days) return null;
  const d = new Date(e.quote_issue_date);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(e.valid_days));
  return d.toISOString().slice(0, 10);
}

function daysSince(dateStr) {
  const d = Date.parse(dateStr || "");
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}

export default function EstimatorQueues() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const status = params.get("status") || "";
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(params.get("q") || "");
  const [sort, setSort] = useState(params.get("sort") || "newest");

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
          entity: base44.entities.AllInOneEstimate,
          sort: "-created_date",
          label: "Estimate queues",
        });
        setEstimates(rows);
      } catch (err) {
        console.error("Estimate queues could not be loaded:", err);
        setLoadError(err?.message || "Estimates could not be loaded.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const buckets = useMemo(() => {
    const by = {};
    for (const s of STATUSES) by[s.key] = { count: 0, total: 0 };
    for (const e of estimates) {
      const bucketKey = e.pipeline_sync_pending === true ? "sync_issues" : (e.status || "draft");
      if (by[bucketKey]) { by[bucketKey].count += 1; by[bucketKey].total += Number(e.quote_total || e.total_cost || 0); }
      by[""].count += 1;
      by[""].total += Number(e.quote_total || e.total_cost || 0);
    }
    return by;
  }, [estimates]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    let list = status === "sync_issues"
      ? estimates.filter((e) => e.pipeline_sync_pending === true)
      : status
        ? estimates.filter((e) => (e.status || "draft") === status)
        : estimates;
    if (q) {
      list = list.filter((e) =>
        [e.project_name, e.client_name, e.estimate_number].some((v) => String(v || "").toLowerCase().includes(q)));
    }
    const val = (e) => Number(e.quote_total || e.total_cost || 0);
    const exp = (e) => expiryOf(e) || "9999-12-31";
    const sorted = [...list];
    if (sort === "oldest") sorted.sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
    else if (sort === "value_desc") sorted.sort((a, b) => val(b) - val(a));
    else if (sort === "expiring") sorted.sort((a, b) => exp(a).localeCompare(exp(b)));
    else sorted.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
    return sorted;
  }, [estimates, status, q, sort]);

  const visibleTotal = rows.reduce((s, e) => s + Number(e.quote_total || e.total_cost || 0), 0);

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">ESTIMATE QUEUES</h1>
          <span className="ml-auto text-xs text-gray-400">{rows.length} shown · {compact(visibleTotal)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUSES.map((s) => {
            const b = buckets[s.key] || { count: 0, total: 0 };
            return (
              <Link
                key={s.key || "all"}
                to={s.key ? `/EstimatorQueues?status=${s.key}` : "/EstimatorQueues"}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  status === s.key
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"
                }`}
                title={`${b.count} · ${money0(b.total)}`}
              >
                {s.label}
                <span className={`ml-1.5 ${status === s.key ? "text-red-100" : "text-gray-400"}`}>
                  {b.count}{b.total > 0 ? ` · ${compact(b.total)}` : ""}
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
              placeholder="Search project, client, or estimate #…"
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
        </div>

        <div className="bg-white">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : loadError ? (
            <div className="px-4 py-10 text-center text-sm text-red-600">{loadError}</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">Nothing in this queue.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((e) => {
                const expires = expiryOf(e);
                const expired = expires && expires < today();
                const expiringSoon = expires && !expired && expires <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
                const age = daysSince(e.updated_date || e.created_date);
                return (
                  <Link
                    key={e.id}
                    to={`/EstimateDetail?id=${e.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-red-50/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-800 truncate">{e.project_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {e.client_name}
                        {e.estimate_number ? ` · ${e.estimate_number}` : ""}
                        {age != null ? ` · ${age}d open` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {expired && <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">EXPIRED</span>}
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}