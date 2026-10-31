import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import ReconcileWizard from "@/components/reconciliation/ReconcileWizard";
import LocationsPanel from "@/components/reconciliation/LocationsPanel";
import { staffEntities } from "@/components/staff/staffEntities";
import { BUCKET_LABELS, TENDER_BUCKETS } from "@/components/reconciliation/reconciliationModel";
import {
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  Vault,
  X,
} from "lucide-react";
import { loadGlLookup } from "@/components/shared/loadGlLookup";
import { downloadCsv } from "@/components/shared/exportCsv";
import {
  GL_EXPORT_HEADERS,
  glExportRows,
  paymentsToGlEntries,
} from "@/components/shared/glExport";

const clean = (v) => String(v ?? "").trim();
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("manageReconciliation", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

const fmtDate = (iso) => {
  const d = clean(iso);
  if (!d) return "—";
  const parsed = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString();
};

const VarianceBadge = ({ value }) => {
  const v = Number(value) || 0;
  if (Math.abs(v) < 0.005) return <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Balanced</span>;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${v > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300" : "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"}`}>
      {v > 0 ? "Over" : "Short"} {usd(Math.abs(v))}
    </span>
  );
};

function BatchDetail({ sessionToken, batchId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [glNote, setGlNote] = useState("");
  const [glBusy, setGlBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    invokeAction(sessionToken, { action: "get_batch", batch_id: batchId })
      .then((d) => active && setDetail(d))
      .catch((e) => active && setError(e?.response?.data?.error || e?.message || "Load failed."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [sessionToken, batchId]);

  const batch = detail?.batch;
  const payments = detail?.payments || [];

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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{clean(batch?.batch_number) || "Batch"}</h2>
          <div className="flex items-center gap-2">
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
                ["Expected", usd(batch.expected_total)],
                ["Collected", usd(batch.collected_total)],
                ["Cash adj.", usd(batch.cash_adjustment)],
                ["Variance", usd(batch.variance)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{val}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-600 dark:text-slate-300">
              <div><span className="font-semibold">Location:</span> {clean(batch.location) || "—"}</div>
              <div><span className="font-semibold">Closed:</span> {fmtDate(batch.closed_at)} · by {clean(batch.created_by) || "—"}</div>
              {clean(batch.adjustment_note) && <div><span className="font-semibold">Adjustment note:</span> {batch.adjustment_note}</div>}
              {clean(batch.notes) && <div><span className="font-semibold">Notes:</span> {batch.notes}</div>}
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
            <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-slate-100">Payments swept ({payments.length})</h3>
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
            {glNote && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{glNote}</p>}
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function Reconciliation() {
  const { sessionToken, isRegistered, currentUser } = useAuth();
  const [batches, setBatches] = useState([]);
  const [unreconciled, setUnreconciled] = useState([]);
  const [locations, setLocations] = useState([]);
  const [salesLocations, setSalesLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [openId, setOpenId] = useState("");

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError("");
    try {
      const data = await invokeAction(sessionToken, { action: "bootstrap" });
      setBatches(data.batches || []);
      setUnreconciled(data.unreconciled || []);
      setLocations(data.locations || []);
      // SalesLocation registry -- the wizard's location select reads active
      // rows from here. Until the staff gateways allowlist the entity this
      // resolves to an empty list and the select falls back to past batch
      // locations rather than failing the page.
      const salesLocationRows = await staffEntities.SalesLocation.list("name", 200).catch(() => []);
      setSalesLocations(Array.isArray(salesLocationRows) ? salesLocationRows : []);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  if (!isRegistered) return null;

  const pendingTotal = unreconciled.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reconciliation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Batched cash close — group payments, count tenders, track variance.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
          </button>
          <button onClick={() => setShowWizard(true)} disabled={unreconciled.length === 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            <Plus className="h-4 w-4" />New Reconciliation
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unreconciled</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{unreconciled.length} payment{unreconciled.length === 1 ? "" : "s"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Waiting to close</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{usd(pendingTotal)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Batches closed</div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{batches.length}</div>
        </div>
      </div>

      <LocationsPanel locations={salesLocations} isAdmin={currentUser?.role === "admin"} onChanged={load} />

      {error && <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {notice && <div className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && batches.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading batches…</div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Vault className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            {unreconciled.length === 0
              ? "No reconciliation batches yet — recorded payments will appear here once collected."
              : `No batches yet. ${unreconciled.length} payment${unreconciled.length === 1 ? "" : "s"} (${usd(pendingTotal)}) waiting — start a New Reconciliation to close them.`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Batch</th><th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5 text-right">Payments</th>
                <th className="px-4 py-2.5 text-right">Collected</th><th className="px-4 py-2.5">Variance</th>
                <th className="px-4 py-2.5">By</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1.5"><Scale className="h-3.5 w-3.5 text-violet-500" />{b.batch_number}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(b.closed_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{b.location || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{b.payment_count}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{usd(b.collected_total)}</td>
                  <td className="px-4 py-2.5"><VarianceBadge value={b.variance} /></td>
                  <td className="px-4 py-2.5 text-slate-500">{b.created_by || "—"}</td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showWizard && (
        <ReconcileWizard
          sessionToken={sessionToken}
          payments={unreconciled}
          batches={batches}
          locations={locations}
          salesLocations={salesLocations}
          invoke={invokeAction}
          onClose={() => setShowWizard(false)}
          onClosed={(data) => {
            setShowWizard(false);
            setNotice(`${clean(data?.batch?.batch_number) || "Batch"} closed — ${data?.swept_count ?? 0} payment${(data?.swept_count ?? 0) === 1 ? "" : "s"} swept${data?.skipped_payment_ids?.length ? `, ${data.skipped_payment_ids.length} skipped (changed mid-close)` : ""}.`);
            load();
          }}
        />
      )}
      {openId && <BatchDetail sessionToken={sessionToken} batchId={openId} onClose={() => setOpenId("")} />}
    </div>
  );
}
