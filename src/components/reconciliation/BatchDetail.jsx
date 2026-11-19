import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, RotateCcw, X } from "lucide-react";
import { StatusChip, filterInputCls, statusLabel } from "@/components/kit";
import { loadGlLookup } from "@/components/shared/loadGlLookup";
import { downloadCsv } from "@/components/shared/exportCsv";
import {
  GL_EXPORT_HEADERS,
  glExportRows,
  paymentsToGlEntries,
} from "@/components/shared/glExport";
import {
  BUCKET_LABELS,
  TENDER_BUCKETS,
  batchAdjustmentRows,
  batchAdjustmentsAmount,
  batchCollected,
  batchExpected,
  batchName,
  batchPaymentCount,
  batchStatus,
  batchStatusTone,
  batchVariance,
  canReopenBatch,
  clean,
  statusHistory,
  validReopenReason,
} from "./reconUiModel";

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputCls = filterInputCls;

const fmtStamp = (iso) => {
  const d = clean(iso);
  if (!d) return "—";
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleString();
};

// Batch detail modal — get_batch for the header figures + swept payments.
// I-03 additions over the legacy inline detail: the *_amount mirror fields,
// itemized cash adjustments, a closed → reopened status history (with the
// admin reason), and the admin-only Reopen action that un-stamps the batch's
// payments back into the candidate pool. A reopened batch keeps its
// payment_ids snapshot as an audit stub while get_batch returns payments:[]
// — the un-stamped rows are re-swept into a NEW close, never re-locked here.
export default function BatchDetail({ sessionToken, invoke, batchId, currentUser, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [glNote, setGlNote] = useState("");
  const [glBusy, setGlBusy] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState("");

  const load = useCallback(async () => {
    if (!sessionToken || !batchId) return;
    setLoading(true);
    setError("");
    try {
      const data = await invoke(sessionToken, { action: "get_batch", batch_id: batchId });
      setDetail(data);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, invoke, batchId]);

  useEffect(() => { load(); }, [load]);

  const batch = detail?.batch;
  const payments = detail?.payments || [];
  const status = batchStatus(batch);
  const reopenable = canReopenBatch(currentUser, batch);
  const adjustments = batchAdjustmentRows(batch);
  const history = statusHistory(batch);
  const snapshotIds = Array.isArray(batch?.payment_ids) ? batch.payment_ids : [];

  // GL export: one receipt journal line per swept payment. gl_account resolves
  // through the MarkupCategory/Inventory/PartTemplate mappings; unmapped rows
  // still export and are counted so Manage Accounts can be completed.
  const downloadGl = async () => {
    if (glBusy || payments.length === 0) return;
    setGlBusy(true);
    setGlNote("");
    try {
      const lookup = await loadGlLookup();
      const { rows, unmapped } = glExportRows(paymentsToGlEntries({ payments, batch }), lookup);
      const name = clean(batch?.batch_number) || "batch";
      downloadCsv(`gl-export-${name}.csv`, GL_EXPORT_HEADERS, rows);
      setGlNote(unmapped
        ? `${unmapped} of ${rows.length} rows exported without a GL account — map categories/items in Manage Accounts.`
        : `${rows.length} rows exported — all GL-mapped.`);
    } catch (e) {
      setGlNote(e?.message || "GL export failed.");
    } finally {
      setGlBusy(false);
    }
  };

  const reopen = async () => {
    if (reopenBusy || !reopenable) return;
    if (!validReopenReason(reopenReason)) {
      setReopenError("Give a reason (at least 3 characters) — it is recorded on the batch.");
      return;
    }
    setReopenBusy(true);
    setReopenError("");
    try {
      const data = await invoke(sessionToken, {
        action: "reopen_batch",
        batch_id: batchId,
        reason: clean(reopenReason),
      });
      const released = data?.unstamped_count ?? 0;
      setNotice(`Batch reopened — ${released} payment${released === 1 ? "" : "s"} released back to the candidate pool.`);
      setReopenOpen(false);
      setReopenReason("");
      onChanged?.(data);
      await load();
    } catch (err) {
      setReopenError(err?.response?.data?.error || err?.message || "The batch could not be reopened.");
    } finally {
      setReopenBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{batchName(batch)}</h2>
            {batch && <StatusChip tone={batchStatusTone(status)} label={statusLabel(status)} />}
          </div>
          <div className="flex items-center gap-2">
            {reopenable && !reopenOpen && (
              <button type="button" onClick={() => { setReopenOpen(true); setReopenError(""); }}
                title="Release this batch's payments back to the candidate pool (admin only — leaves a read-only audit stub)"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40">
                <RotateCcw className="h-3.5 w-3.5" />
                Reopen
              </button>
            )}
            <button type="button" onClick={downloadGl} disabled={loading || glBusy || payments.length === 0}
              title="Journal-style CSV (date, memo, entity_ref, gl_account, debit, credit) for this batch's receipts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
              {glBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download GL export
            </button>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading batch…</div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>
        ) : batch ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Expected", usd(batchExpected(batch))],
                ["Collected", usd(batchCollected(batch))],
                ["Cash adj.", usd(batchAdjustmentsAmount(batch))],
                ["Variance", usd(batchVariance(batch))],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{val}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-1 text-sm text-slate-600 dark:text-slate-300">
              <div><span className="font-semibold">Location:</span> {clean(batch.location) || clean(batch.location_id) || "—"}</div>
              {history.map((ev) => (
                <div key={ev.label}>
                  <span className="font-semibold">{ev.label}:</span> {fmtStamp(ev.at)}{ev.by ? ` · by ${ev.by}` : ""}
                  {ev.detail ? ` — ${ev.detail}` : ""}
                </div>
              ))}
              {adjustments.map((a, i) => (
                <div key={`adj-${i}`}>
                  <span className="font-semibold">Cash adjustment:</span> {usd(a.amount)}
                  {a.reason ? ` — ${a.reason}` : ""}{a.note && a.note !== a.reason ? ` (${a.note})` : ""}
                </div>
              ))}
              {clean(batch.adjustment_note) && adjustments.length === 0 && (
                <div><span className="font-semibold">Adjustment note:</span> {batch.adjustment_note}</div>
              )}
              {clean(batch.notes) && <div className="whitespace-pre-wrap"><span className="font-semibold">Notes:</span> {batch.notes}</div>}
            </div>

            {batch.method_totals && Object.keys(batch.method_totals).length > 0 && (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <tr><th className="px-4 py-2">Tender</th><th className="px-4 py-2 text-right">Expected</th><th className="px-4 py-2 text-right">Counted</th></tr>
                  </thead>
                  <tbody>
                    {TENDER_BUCKETS.map((b) => (
                      <tr key={b} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-1.5 font-medium">{BUCKET_LABELS[b]}</td>
                        <td className="px-4 py-1.5 text-right">{usd(batch.method_totals?.[b]?.expected)}</td>
                        <td className="px-4 py-1.5 text-right">{usd(batch.method_totals?.[b]?.counted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">
              {status === "reopened" ? "Payments released" : "Payments swept"} ({status === "reopened" ? snapshotIds.length : payments.length})
            </h3>
            {status === "reopened" ? (
              <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                This batch was reopened — its payments were un-stamped and are candidates for a new close.
                The retained snapshot lists {snapshotIds.length} payment id{snapshotIds.length === 1 ? "" : "s"} for audit.
                {snapshotIds.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-semibold">Payment id snapshot</summary>
                    <div className="mt-1 max-h-24 overflow-y-auto break-all text-xs">{snapshotIds.join(", ")}</div>
                  </details>
                )}
              </div>
            ) : (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
                        <td className="px-3 py-1.5 text-slate-500">{p.paid_date || "—"}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-800 dark:text-slate-200">{p.invoice_number || p.invoice_id || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{p.customer_display_name || "—"}</td>
                        <td className="px-3 py-1.5 text-slate-500">{BUCKET_LABELS[p.bucket] || p.method}</td>
                        <td className="px-3 py-1.5 text-right font-semibold">{usd(p.amount)}</td>
                      </tr>
                    ))}
                    {payments.length === 0 && <tr><td className="px-3 py-4 text-center text-slate-500">No payments recorded on this batch.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {reopenOpen && reopenable && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <div className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  Reopening releases all {batchPaymentCount(batch)} swept payment{batchPaymentCount(batch) === 1 ? "" : "s"} back to the candidate pool. The batch stays as a read-only audit stub.
                </div>
                <div className="mt-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Reason *</label>
                  <input className={inputCls} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="e.g. Drawer recounted — cash off by $5" autoFocus />
                </div>
                {reopenError && <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{reopenError}</div>}
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => { setReopenOpen(false); setReopenReason(""); setReopenError(""); }}
                    className="min-h-9 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">Cancel</button>
                  <button type="button" onClick={reopen} disabled={reopenBusy || !validReopenReason(reopenReason)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                    {reopenBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Reopen batch
                  </button>
                </div>
              </div>
            )}

            {notice && <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}
            {glNote && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{glNote}</p>}
          </>
        ) : null}
      </div>
    </div>
  );
}
