import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowUpDown, Calculator, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import EstimateCard from "@/components/estimator/EstimateCard";
import NewEstimateDialog from "@/components/estimator/NewEstimateDialog";
import { runHistoricalBuilderBackfill } from "@/components/estimator/builder/historicalBackfill";
import { runLegacyBomReconcile } from "@/components/estimator/builder/legacyBomReconcile";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { quoteExpirationDate } from "@/components/estimator/quoteLifecycle";
import { staffEntities } from "@/components/staff/staffEntities";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";

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

function expiryOf(e) {
  const validDays = e.quote_valid_days ?? e.valid_days;
  if ((e.status || "draft") !== "sent" || !e.quote_issue_date || !validDays) return null;
  return quoteExpirationDate(e.quote_issue_date, validDays) || null;
}

export default function Estimator() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "";
  const sort = searchParams.get("sort") || "newest";
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [showNew, setShowNew] = useState(
    new URLSearchParams(window.location.search).get("new") === "1"
  );
  const backfillStartedRef = useRef(false);

  const load = async () => {
    try {
      const rows = await loadAllEntityRows({
        entity: staffEntities.AllInOneEstimate,
        sort: "-created_date",
        label: "Estimates",
      });
      setEstimates(rows);

      // The migration writes a server-side completion sentinel and is
      // resumable — once a full run finishes, this browser never runs it
      // again, and background tabs / open 429 breakers never start it.
      const bomDone = (() => { try { return Boolean(localStorage.getItem("ccs.bomMigration.done.v1")); } catch { return false; } })();
      if (!backfillStartedRef.current && !bomDone && !document.hidden && !isFleetCoolingDown()) {
        backfillStartedRef.current = true;
        runHistoricalBuilderBackfill({ seedEstimates: rows })
          .then(async (result) => {
            if (result?.estimates?.length) setEstimates(result.estimates);
            await runLegacyBomReconcile();
            try { localStorage.setItem("ccs.bomMigration.done.v1", new Date().toISOString()); } catch {}
          })
          .catch((error) => {
            // Historical conversion/reconciliation must never block normal estimating.
            // Each migration writes its completion marker last, so the next admin
            // visit can resume safely if either pass is interrupted.
            console.error("Historical Product/BOM migration paused:", error);
          });
      }
    } catch (error) {
      console.error("Estimates could not be loaded:", error);
      setLoadError(error?.message || "Estimates could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  // Trashed estimates never appear in queue counts or lists — they are only
  // reachable through the Trash chip on Estimate Queues.
  const liveEstimates = useMemo(() => estimates.filter((e) => e?.deleted !== true), [estimates]);

  const buckets = useMemo(() => {
    const by = {};
    for (const s of STATUSES) by[s.key] = { count: 0, total: 0 };
    for (const e of liveEstimates) {
      const bucketKey = e.pipeline_sync_pending === true ? "sync_issues" : (e.status || "draft");
      if (by[bucketKey]) { by[bucketKey].count += 1; by[bucketKey].total += Number(e.quote_total || e.total_cost || 0); }
      by[""].count += 1;
      by[""].total += Number(e.quote_total || e.total_cost || 0);
    }
    return by;
  }, [liveEstimates]);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = status === "sync_issues"
      ? liveEstimates.filter((e) => e.pipeline_sync_pending === true)
      : status
        ? liveEstimates.filter((e) => (e.status || "draft") === status)
        : liveEstimates;
    if (term) {
      list = list.filter((e) =>
        [e.project_name, e.client_name, e.estimate_number]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      );
    }
    const val = (e) => Number(e.quote_total || e.total_cost || 0);
    const exp = (e) => expiryOf(e) || "9999-12-31";
    const sorted = [...list];
    if (sort === "oldest") sorted.sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
    else if (sort === "value_desc") sorted.sort((a, b) => val(b) - val(a));
    else if (sort === "expiring") sorted.sort((a, b) => exp(a).localeCompare(exp(b)));
    else sorted.sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)));
    return sorted;
  }, [liveEstimates, status, term, sort]);

  const visibleTotal = filtered.reduce((s, e) => s + Number(e.quote_total || e.total_cost || 0), 0);

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="clay-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                boxShadow: 'inset 2px 2px 6px rgba(255,255,255,0.7), inset -2px -2px 6px rgba(0,0,0,0.08)',
              }}
            >
              <Calculator className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Estimator</h1>
              <p className="text-sm text-gray-500">Build and price multi-section sign estimates</p>
            </div>
          </div>
          <Button onClick={() => navigate("/NewAllInOneEstimate")} className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
            <Plus className="w-4 h-4" /> New Estimate
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {STATUSES.map((s) => {
            const b = buckets[s.key] || { count: 0, total: 0 };
            return (
              <button
                key={s.key || "all"}
                type="button"
                onClick={() => setParam("status", s.key)}
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
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setParam("q", e.target.value); }}
              placeholder="Search by description, client or estimate number"
              className="pl-9 clay-card border-none h-11"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="clay-card border-none h-11 px-2 text-xs font-semibold text-gray-600 outline-none"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <span className="text-xs text-gray-400">
            {filtered.length} estimate{filtered.length === 1 ? "" : "s"} · {compact(visibleTotal)}
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading estimates…</div>
        ) : loadError ? (
          <div className="clay-card text-center py-16">
            <p className="text-red-600 font-medium">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="clay-card text-center py-16">
            <Calculator className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              {liveEstimates.length === 0 ? "No estimates yet" : "No estimates match your search"}
            </p>
            {liveEstimates.length === 0 && (
              <p className="text-sm text-gray-400 mt-1">Create your first estimate to get started.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((estimate) => (
              <EstimateCard key={estimate.id} estimate={estimate} />
            ))}
          </div>
        )}
      </div>

      <NewEstimateDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(estimate) => {
          setEstimates((prev) => [estimate, ...prev]);
          setShowNew(false);
        }}
      />
    </div>
  );
}