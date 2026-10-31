import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, MapPin, X } from "lucide-react";
import { TENDER_BUCKETS, BUCKET_LABELS, batchTotals, computeVariance, nextBatchNumber } from "./reconciliationModel";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { filterInputCls } from "@/components/kit";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputCls = filterInputCls;
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

// "New Reconciliation" wizard: lists every unreconciled payment grouped by
// tender bucket with expected totals, takes counted amounts plus an optional
// cash adjustment, and closes the batch through manageReconciliation.
export default function ReconcileWizard({ sessionToken, payments, batches, locations, salesLocations = [], invoke, onClose, onClosed }) {
  const expected = useMemo(() => batchTotals(payments), [payments]);
  const previewNumber = useMemo(() => nextBatchNumber(batches), [batches]);
  const [counted, setCounted] = useState(() => Object.fromEntries(TENDER_BUCKETS.map((b) => [b, ""])));
  // The batch location comes from the SalesLocation registry now (stored on
  // the batch as the location name, same as the free-text days). Legacy
  // locations that never became registry rows stay selectable below.
  const locationOptions = useMemo(() => {
    const opts = [];
    const seen = new Set();
    for (const loc of salesLocations || []) {
      const name = clean(loc?.name);
      if (!name || loc?.active === false || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const code = clean(loc?.code);
      opts.push({ value: name, label: code ? `${name} (${code})` : name });
    }
    for (const loc of locations || []) {
      const name = clean(loc);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      opts.push({ value: name, label: name });
    }
    return opts;
  }, [salesLocations, locations]);
  const [location, setLocation] = useState(() => clean(locationOptions[0]?.value));
  const [adjustment, setAdjustment] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef(crypto.randomUUID());

  const countedTotal = TENDER_BUCKETS.reduce((s, b) => s + (Number(counted[b]) || 0), 0);
  const adj = Number(adjustment) || 0;
  const variance = computeVariance(expected.total, countedTotal || expected.total, adj);
  const countedBlank = TENDER_BUCKETS.every((b) => !clean(counted[b]));

  const grouped = useMemo(() => {
    const out = Object.fromEntries(TENDER_BUCKETS.map((b) => [b, []]));
    for (const p of payments || []) out[p.bucket || "other"]?.push(p);
    return out;
  }, [payments]);

  const submit = async () => {
    if (saving) return;
    if (adj !== 0 && !clean(adjustmentNote)) { setError("Explain the cash adjustment."); return; }
    setSaving(true);
    setError("");
    try {
      const data = await invoke(sessionToken, {
        action: "create_batch",
        creation_request_key: keyRef.current,
        location: clean(location),
        counted: Object.fromEntries(TENDER_BUCKETS.map((b) => [b, Number(counted[b]) || 0])),
        cash_adjustment: adj,
        adjustment_note: clean(adjustmentNote),
        notes: clean(notes),
      });
      // Unified alerts: closing with a non-zero variance emits recon_variance —
      // fire-and-forget, it never blocks the batch close.
      try {
        const batchVariance = Number(data?.batch?.variance);
        const resolvedVariance = Number.isFinite(batchVariance) ? batchVariance : variance;
        if (data?.batch?.id && Math.abs(resolvedVariance) >= 0.005) {
          void NotificationTriggers.reconVariance(data.batch, { variance: resolvedVariance });
        }
      } catch { /* notify is best-effort */ }
      onClosed?.(data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The batch could not be closed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">New Reconciliation — {previewNumber}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{expected.count} recorded payment{expected.count === 1 ? "" : "s"} since the last close.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Location</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select className={`${inputCls} pl-9`} value={location} onChange={(e) => setLocation(e.target.value)}>
                {locationOptions.length === 0 && <option value="">No locations -- add one in the Locations panel</option>}
                {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Cash adjustment $</label>
              <input className={inputCls} type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Adjustment note{adj !== 0 ? " *" : ""}</label>
              <input className={inputCls} value={adjustmentNote} onChange={(e) => setAdjustmentNote(e.target.value)} placeholder="Till over/short reason" />
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Tender</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Expected</th>
                <th className="px-4 py-2 text-right">Counted</th>
                <th className="px-4 py-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {TENDER_BUCKETS.map((b) => {
                const exp = expected[b] || 0;
                const countedVal = counted[b] === "" ? exp : Number(counted[b]) || 0;
                const v = computeVariance(exp, countedVal, b === "cash" ? adj : 0);
                return (
                  <tr key={b} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-semibold text-slate-800 dark:text-slate-200">{BUCKET_LABELS[b]}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{grouped[b].length}</td>
                    <td className="px-4 py-2 text-right">{usd(exp)}</td>
                    <td className="px-4 py-2 text-right">
                      <input className="w-28 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        type="number" step="0.01" min="0" placeholder={exp.toFixed(2)} value={counted[b]}
                        onChange={(e) => setCounted((c) => ({ ...c, [b]: e.target.value }))} />
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${Math.abs(v) < 0.005 ? "text-emerald-600" : "text-amber-600"}`}>{usd(v)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-800/60">
                <td className="px-4 py-2 text-slate-900 dark:text-slate-100">Total</td>
                <td className="px-4 py-2 text-right">{expected.count}</td>
                <td className="px-4 py-2 text-right">{usd(expected.total)}</td>
                <td className="px-4 py-2 text-right">{usd(countedBlank ? expected.total : countedTotal)}</td>
                <td className={`px-4 py-2 text-right ${Math.abs(variance) < 0.005 ? "text-emerald-600" : "text-amber-600"}`}>{usd(variance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">Blank counted fields default to the expected amount. The cash adjustment is applied to the cash line.</p>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400">Payments in this close ({payments?.length || 0})</summary>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-xs">
              <tbody>
                {(payments || []).map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
                    <td className="px-3 py-1.5 text-slate-500">{p.paid_date || "—"}</td>
                    <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200">{p.invoice_number || p.invoice_id || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{p.customer_display_name || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500">{BUCKET_LABELS[p.bucket] || p.method}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{usd(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="mt-3">
          <label className={labelCls}>Batch notes</label>
          <textarea className={`${inputCls} min-h-14`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Deposit bag #, drawer, anything the next closer should know…" />
        </div>

        {Math.abs(variance) >= 0.005 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            This close is {variance > 0 ? "over" : "short"} by {usd(Math.abs(variance))}. Double-check the counted amounts before closing.
          </div>
        )}
        {error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
          <button onClick={submit} disabled={saving || expected.count === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Close batch {previewNumber}
          </button>
        </div>
      </div>
    </div>
  );
}
