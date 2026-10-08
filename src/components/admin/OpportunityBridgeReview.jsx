import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const STORAGE_KEY = "ccsOpportunityBridgeLastSimulationSummaryV1";

const FILTERS = [
  { key:"safe", label:"Safe proposals", actions:["proposed_create","proposed_recover_link","already_linked"] },
  { key:"held", label:"Held for review", actions:["hold"] },
  { key:"excluded", label:"Excluded", actions:["excluded"] },
];

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const signed = (value) => value === 0 ? "0" : value > 0 ? `+${value}` : String(value);

function readPreviousSummary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function savePreviousSummary(summary) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      captured_at:new Date().toISOString(),
      summary:summary || {},
    }));
  } catch {
    // Browser storage is optional; simulation remains usable without it.
  }
}

function MetricCard({ label, value, delta = null, tone = "slate" }) {
  const tones = {
    emerald:"border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100",
    amber:"border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100",
    blue:"border-blue-200 bg-blue-50/80 text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100",
    slate:"border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.slate}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-2xl font-bold">{number(value).toLocaleString()}</span>
        {delta !== null && delta !== 0 && (
          <span className="pb-0.5 text-xs font-semibold opacity-75">{signed(delta)} since last simulation</span>
        )}
      </div>
    </div>
  );
}

function RowDetails({ row }) {
  const [open, setOpen] = useState(false);
  const proposal = row?.proposed_opportunity || {};
  const reconciliation = row?.historical_reconciliation;
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-start gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">{row.work_order_id}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {row.action}
            </span>
            {proposal.stage && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                proposed stage: {proposal.stage}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{row.receipt_key || "No receipt key"}</div>
          {(row.reasons || []).length > 0 && (
            <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{row.reasons.join(" · ")}</div>
          )}
        </div>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-slate-200 p-3 text-xs dark:border-slate-700 lg:grid-cols-2">
          <div>
            <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Source snapshot</div>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100 whitespace-pre-wrap break-all">
              {JSON.stringify(row.source_snapshot || {}, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Proposed Opportunity</div>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100 whitespace-pre-wrap break-all">
              {JSON.stringify(proposal, null, 2)}
            </pre>
          </div>
          {reconciliation && (
            <div className="lg:col-span-2">
              <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Historical reconciliation</div>
              <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100 whitespace-pre-wrap break-all">
                {JSON.stringify(reconciliation, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OpportunityBridgeReview() {
  const [filter, setFilter] = useState("safe");
  const [result, setResult] = useState(null);
  const [previous, setPrevious] = useState(() => readPreviousSummary());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeFilter = FILTERS.find((item) => item.key === filter) || FILTERS[0];

  const runSimulation = async ({ preservePrevious = false } = {}) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("opportunityBridgeSimulation", {
        mode:"simulation",
        limit:25,
        actions:activeFilter.actions,
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Opportunity bridge simulation failed.");
      if (data?.simulation_only !== true || data?.write_capability !== false || data?.apply_path_enabled !== false) {
        throw new Error("Bridge safety contract could not be verified. No review data was accepted.");
      }
      if (!preservePrevious) setPrevious(readPreviousSummary());
      setResult(data);
      savePreviousSummary(data.summary || {});
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Opportunity bridge simulation failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSimulation({ preservePrevious:true });
  }, [filter]);

  const summary = result?.summary || {};
  const readiness = result?.readiness || null;
  const receiptLedger = result?.receipt_ledger || null;
  const pilotReview = result?.pilot_review || null;
  const sourceAuthorizationMatchesFreshReview = result?.source_authorization_matches_fresh_review === true;
  const sourceAuthorizedReviewFingerprint = String(result?.source_authorized_review_fingerprint || "");
  const confirmationContract = result?.secondary_confirmation_contract || null;
  const confirmationBinding = result?.secondary_confirmation_binding || null;
  const previousSummary = previous?.summary || null;
  const safeTotal = number(summary.proposed_create) + number(summary.proposed_recover_link) + number(summary.already_linked);
  const previousSafe = previousSummary
    ? number(previousSummary.proposed_create) + number(previousSummary.proposed_recover_link) + number(previousSummary.already_linked)
    : null;
  const deltas = useMemo(() => ({
    sales: previousSummary ? number(summary.sales_candidates) - number(previousSummary.sales_candidates) : null,
    safe: previousSummary ? safeTotal - previousSafe : null,
    won: previousSummary ? number(summary.historical_deterministic_won) - number(previousSummary.historical_deterministic_won) : null,
    held: previousSummary ? number(summary.held) - number(previousSummary.held) : null,
  }), [summary, previousSummary, safeTotal, previousSafe]);

  const holdReasons = Object.entries(summary.hold_reason_counts || {}).sort((a,b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 dark:border-violet-900 dark:from-violet-950/30 dark:to-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Opportunity Bridge Review</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              Live server-side simulation of the WorkOrder → Opportunity compatibility bridge. This screen has no apply action and the backend reports write capability disabled.
            </p>
          </div>
          <button
            type="button"
            onClick={() => runSimulation()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-white px-4 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-50 disabled:opacity-60 dark:border-violet-800 dark:bg-slate-900 dark:text-violet-300"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Run Simulation
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Simulation only · write capability disabled · no Apply button · no production bridge records are created from this screen.
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sales candidates" value={summary.sales_candidates} delta={deltas.sales} tone="blue" />
        <MetricCard label="Safe bridge cohort" value={safeTotal} delta={deltas.safe} tone="emerald" />
        <MetricCard label="Historical deterministic Won" value={summary.historical_deterministic_won} delta={deltas.won} tone="emerald" />
        <MetricCard label="Held for review" value={summary.held} delta={deltas.held} tone="amber" />
      </section>

      {readiness && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-amber-950 dark:text-amber-100">Production Apply Readiness: {readiness.decision || "NO_GO"}</h3>
              </div>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Technical checks and rollout gates are evaluated separately. Production apply remains hard-disabled in source. Reviewing or refreshing this screen is not production authorization.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className={`rounded-full px-2.5 py-1 ${readiness.technical_ready ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                Technical: {readiness.technical_ready ? "READY" : "BLOCKED"}
              </span>
              <span className={`rounded-full px-2.5 py-1 ${readiness.rollout_ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-800"}`}>
                Rollout: {readiness.rollout_ready ? "READY" : "LOCKED"}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {(readiness.checks || []).map((check) => (
              <div key={check.key} className="flex items-start gap-2 rounded-lg border border-amber-200/80 bg-white/80 p-2.5 text-xs dark:border-amber-900 dark:bg-slate-900/70">
                {check.pass
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{check.key.replaceAll("_", " ")}</div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-400">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-white/80 p-3 text-xs dark:border-amber-900 dark:bg-slate-900/70">
              <div className="font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Durable receipt foundation</div>
              <div className="mt-1 text-slate-700 dark:text-slate-300">
                Active · {number(receiptLedger?.total).toLocaleString()} records · {number(receiptLedger?.anomaly_count).toLocaleString()} identity anomalies · {number(receiptLedger?.unresolved_count).toLocaleString()} unresolved
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white/80 p-3 text-xs dark:border-amber-900 dark:bg-slate-900/70">
              <div className="font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">Secondary confirmation contract</div>
              <div className="mt-1 text-slate-700 dark:text-slate-300">
                {confirmationContract?.configured ? "Configured" : "Not configured"} · {confirmationContract?.mode || "unknown"} · exact admin actor + exact run + exact batch
              </div>
              {confirmationBinding && (
                <div className="mt-1 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  Run {confirmationBinding.run_id} · batch {String(confirmationBinding.batch_fingerprint || "").slice(0, 12)}… · expires {confirmationBinding.expires_at}
                </div>
              )}
              <div className="mt-1 text-slate-500 dark:text-slate-400">Confirmation phrase/token is not stored or exposed by this review screen.</div>
            </div>
          </div>

          {(readiness.first_batch || []).length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3 dark:border-amber-900 dark:bg-slate-900/70">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                Proposed first batch — planning only
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {readiness.first_batch.map((row) => (
                  <span key={row.work_order_id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {row.work_order_id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Live simulation details</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {result ? `Examined ${number(result.live_counts?.workorders_examined).toLocaleString()} WorkOrders · ${number(result.live_counts?.opportunities).toLocaleString()} existing Opportunities · showing up to 25 rows` : "Loading current simulation…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                type="button"
                key={item.key}
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
                className={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${filter === item.key
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {filter === "held" && holdReasons.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">Hold reasons</div>
            <div className="flex flex-wrap gap-2">
              {holdReasons.map(([reason,count]) => (
                <span key={reason} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 shadow-sm dark:bg-slate-900 dark:text-amber-200">
                  {reason}: {number(count).toLocaleString()}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {loading && !result ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Running read-only simulation…
            </div>
          ) : (result?.selected_rows || []).length ? (
            result.selected_rows.map((row) => <RowDetails key={`${row.work_order_id}-${row.action}`} row={row} />)
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
              <CheckCircle2 className="mx-auto mb-2 h-5 w-5" />
              No rows returned for this filter.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
