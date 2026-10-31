import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Loader2, Pencil, Plus, Receipt, X } from "lucide-react";
import {
  DEFAULT_SCHEDULE,
  MILESTONE_STATUS_LABELS,
  buildEstimateBillingPayload,
  buildMilestoneInvoicePayload,
  deriveBillingState,
  money,
  normalizeSchedule,
} from "../procurement/progressBillingModel";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MILESTONE_BADGES = {
  open: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  billed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
};

const inputCls = "min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const storageKey = (workOrderId) => `ccs.progressBilling.${clean(workOrderId)}`;

function loadSchedule(workOrderId) {
  try {
    const raw = window.localStorage.getItem(storageKey(workOrderId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeSchedule(parsed);
    }
  } catch { /* ignore corrupt storage */ }
  return DEFAULT_SCHEDULE;
}

// Progress (milestone) billing for one job. The schedule is kept client-side
// (localStorage per work order — the WorkOrder entity has no schedule field);
// invoiced dollars are the source of truth for how much of it is billed.
// Billing goes through invoicingAction create_invoice (milestone metadata in
// source_summary) or create_from_estimate when the work order has no customer.
export default function ProgressBillingPanel({ sessionToken, job, workOrder, onChanged }) {
  const workOrderId = clean(job?.work_order_id || workOrder?.id);
  const [schedule, setSchedule] = useState(() => loadSchedule(workOrderId));
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const state = useMemo(
    () => deriveBillingState({ jobTotal: job?.contract_value, schedule, invoiced: job?.invoiced }),
    [job?.contract_value, job?.invoiced, schedule],
  );

  const startEdit = () => {
    setDraftRows(schedule.map((m) => ({ ...m })));
    setEditing(true);
    setError("");
  };

  const saveSchedule = () => {
    const norm = normalizeSchedule(draftRows);
    if (norm.length === 0) { setError("Add at least one milestone with a positive %."); return; }
    setSchedule(norm);
    try { window.localStorage.setItem(storageKey(workOrderId), JSON.stringify(norm)); } catch { /* best effort */ }
    setEditing(false);
    setError("");
  };

  const billNext = async () => {
    const next = state.next;
    if (!next || busy) return;
    if (!window.confirm(`Create a draft invoice for "${next.label}" — ${usd(next.amount)}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let body;
      if (clean(workOrder?.customer_id)) {
        body = buildMilestoneInvoicePayload({
          workOrder, milestone: next, jobTotal: state.job_total, schedule,
          requestKey: `progress-billing:${workOrderId}:${next.index}:${next.amount}`,
        });
      } else if (clean(workOrder?.estimate_id || job?.estimate_id)) {
        body = buildEstimateBillingPayload({
          estimateId: clean(workOrder?.estimate_id || job?.estimate_id),
          milestone: next,
          isFinal: next.is_final,
        });
      } else {
        throw new Error("This job has no linked customer or approved estimate to bill against.");
      }
      const r = await base44.functions.invoke("invoicingAction", { session_token: sessionToken, ...body });
      const data = r?.data || r;
      if (!data?.success) throw new Error(data?.error || "Invoice creation failed.");
      const inv = data.invoice || {};
      setNotice(`Draft invoice ${inv.invoice_number || ""} created for ${usd(next.amount)} — review and send it from Invoices.`);
      onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Billing failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 md:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Receipt className="h-4 w-4 text-violet-500" />Progress billing
        </h3>
        {!editing && (
          <button type="button" onClick={startEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            <Pencil className="h-3 w-3" />Schedule
          </button>
        )}
      </div>

      {state.job_total <= 0 ? (
        <div className="mt-2 text-xs text-slate-400">No contract value on this job yet — progress billing needs an approved estimate total.</div>
      ) : (
        <>
          {/* cumulative progress bar with milestone boundary ticks */}
          <div className="relative mt-3">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, state.billed_pct)}%` }} />
            </div>
            {state.milestones.slice(0, -1).map((m) => (
              <div key={m.index} className="absolute top-0 h-2.5 w-px bg-slate-400/70" style={{ left: `${m.cumulative_pct}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Billed {usd(state.invoiced)} ({state.billed_pct}%)</span>
            <span>Remaining {usd(state.remaining)}</span>
          </div>
          {state.over_billed > 0 && (
            <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Invoiced exceeds contract value by {usd(state.over_billed)}.
            </div>
          )}

          {/* milestone rows */}
          <div className="mt-2 space-y-1">
            {state.milestones.map((m) => (
              <div key={m.index} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  {m.status === "billed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {m.label} <span className="text-xs text-slate-400">({m.pct}%)</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {m.status === "partial" ? `${usd(m.covered)} of ` : ""}{usd(m.amount)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${MILESTONE_BADGES[m.status] || MILESTONE_BADGES.open}`}>
                    {MILESTONE_STATUS_LABELS[m.status] || m.status}
                  </span>
                </span>
              </div>
            ))}
            {state.unscheduled_amount > 0.005 && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>Unscheduled remainder</span><span>{usd(state.unscheduled_amount)} ({state.unscheduled_pct}%)</span>
              </div>
            )}
          </div>

          {/* schedule editor */}
          {editing && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Billing schedule (% of contract)</div>
              {draftRows.map((row, i) => (
                <div key={i} className="mb-1.5 grid grid-cols-[1fr_90px_28px] items-center gap-2">
                  <input className={inputCls} value={row.label} placeholder={`Milestone ${i + 1}`}
                    onChange={(e) => setDraftRows((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
                  <input className={inputCls} type="number" min="0" max="100" step="any" value={row.pct}
                    onChange={(e) => setDraftRows((rows) => rows.map((r, j) => (j === i ? { ...r, pct: e.target.value } : r)))} />
                  <button type="button" onClick={() => setDraftRows((rows) => rows.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setDraftRows((rows) => [...rows, { label: "", pct: "" }])}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300">
                <Plus className="h-3.5 w-3.5" />Add milestone
              </button>
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Cumulative % is capped at 100. Under-100% schedules leave an unbilled remainder.
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => { setEditing(false); setError(""); }}
                  className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
                <button type="button" onClick={saveSchedule}
                  className="min-h-9 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700">Save schedule</button>
              </div>
            </div>
          )}

          {/* bill next milestone */}
          {!editing && (
            <div className="mt-3">
              {state.next ? (
                <button type="button" onClick={billNext} disabled={busy}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
                  Bill next: {state.next.label} — {usd(state.next.amount)}
                </button>
              ) : (
                <div className="text-xs font-semibold text-emerald-600">
                  {state.complete ? "Fully billed — all milestones covered by invoices." : "Nothing billable yet."}
                </div>
              )}
              {state.next && !clean(workOrder?.customer_id) && !clean(workOrder?.estimate_id || job?.estimate_id) && (
                <div className="mt-1 text-xs text-amber-600">No customer or estimate linked — billing will fail until one is set.</div>
              )}
            </div>
          )}

          {error && <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
          {notice && <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}
        </>
      )}
    </div>
  );
}
