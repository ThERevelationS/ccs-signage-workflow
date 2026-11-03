import { useMemo, useState } from "react";
import { X, Loader2, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { invokeFleet } from "@/components/fleet/fleetInvoke";
import { useEscapeKey, useModalDialog } from "@/components/estimator/a11y";

const name = (c) => c?.company_name || c?.display_name || c?.customer_name || c?.client_name || "Unnamed customer";
const norm = (v) => String(v || "").trim().toLowerCase();
const EMPTY_CUSTOMERS = [];

const masterLabel = (c) =>
  c?.master_account ? `${c.master_account}` : (c?.master_account_id ? "(linked account)" : "");

// Merge two Customer records through the manageCustomerLifecycle backend
// (masterplan G-14). ALL business logic lives server-side +
// base44/shared/customerMergeModel.ts — this dialog only renders the preview
// plan, the master-account context and the per-entity progress/result the
// function returns. A 'partial' result can be resumed with the same run key.
export default function CustomerMergeDialog({ open, customers = EMPTY_CUSTOMERS, onClose, onMerged }) {
  const [keepId, setKeepId] = useState("");
  const [loseId, setLoseId] = useState("");
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const { containerRef, dialogProps } = useModalDialog({ open, labelledBy: "customer-merge-title" });
  useEscapeKey(open, () => { if (!busy) onClose?.(); });

  const active = useMemo(
    () => customers.filter((c) => c?.id && !c.merged_into_customer_id && c.deleted !== true),
    [customers]
  );
  const keep = active.find((c) => c.id === keepId);
  const lose = active.find((c) => c.id === loseId);

  const duplicates = useMemo(() => {
    const byName = new Map();
    for (const c of active) {
      const key = norm(name(c));
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(c);
    }
    return [...byName.values()].filter((g) => g.length > 1);
  }, [active]);

  if (!open) return null;

  const scanLinks = async (loseCustomer, keepCustomer = keep) => {
    if (!loseCustomer?.id || !keepCustomer?.id) { setPreview(null); return; }
    setScanning(true);
    setPreview(null);
    setResult(null);
    setError("");
    try {
      const body = await invokeFleet("manageCustomerLifecycle", {
        action: "preview_customer_merge",
        keep_id: keepCustomer.id,
        lose_id: loseCustomer.id,
      }).then((r) => (r && typeof r === "object" && "data" in r ? r.data : r));
      if (!body?.ok && !body?.already_merged) {
        setPreview(body || null); // blocked — preview.reason renders why
      } else {
        setPreview(body || null);
        if (body?.already_merged) setError("");
      }
    } catch (e) {
      setError(e?.message || "The merge preview could not be loaded.");
    } finally {
      setScanning(false);
    }
  };

  const confirmMerge = async () => {
    if (!keep?.id || !lose?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = await invokeFleet("manageCustomerLifecycle", {
        action: "merge_customers",
        keep_id: keep.id,
        lose_id: lose.id,
        merge_run_key: result?.run_key || preview?.run_key || undefined,
      }).then((r) => (r && typeof r === "object" && "data" in r ? r.data : r));
      setResult(body || null);
      if (body?.status === "merged" || body?.status === "already_merged") {
        onMerged?.({ keep, lose, result: body });
      } else if (body?.status !== "partial") {
        setError(body?.reason || "The merge could not be completed.");
      }
    } catch (e) {
      setError(e?.message || "The merge could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const done = result?.status === "merged" || result?.status === "already_merged";
  const partial = result?.status === "partial";
  const entityRows = result?.entities || preview?.entities || [];
  const linkedRows = entityRows.filter((e) => (e.linked ?? e.scanned ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => { if (!busy) onClose?.(); }} />
      <div ref={containerRef} {...dialogProps} className="relative bg-white rounded-md shadow-2xl border border-gray-300 w-full max-w-lg max-h-[90vh] flex flex-col" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 id="customer-merge-title" className="text-lg font-bold tracking-wide" style={{ color: "#7a9a4b" }}>MERGE CUSTOMERS</h2>
          <button type="button" onClick={() => { if (!busy) onClose?.(); }} className="text-gray-500 hover:text-gray-800 p-1" title="Close" aria-label="Close merge customers dialog"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <div className="px-5 pb-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-gray-600">
            Pick which customer to keep. Every linked record (estimates, work orders, invoices, payments, opportunities, contacts, locations, portal links, files and more) is relinked to it; the other record is marked merged and inactive — kept for audit, never deleted. Administrator access required.
          </p>
          {duplicates.length > 0 && !result && (
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {duplicates.length} possible duplicate group{duplicates.length === 1 ? "" : "s"}: {duplicates.map((g) => name(g[0])).slice(0, 3).join(" · ")}
            </p>
          )}
          <label className="block text-[11px] font-bold text-gray-600">
            KEEP (records move here)
            <select
              value={keepId}
              onChange={(e) => { setKeepId(e.target.value); setResult(null); setPreview(null); const next = active.find((c) => c.id === e.target.value); if (lose && next) scanLinks(lose, next); }}
              disabled={busy}
              className="mt-1 w-full h-9 px-2 border border-gray-300 rounded text-sm font-normal"
            >
              <option value="">Select customer…</option>
              {active.map((c) => <option key={c.id} value={c.id}>{name(c)}{masterLabel(c) ? ` — ${masterLabel(c)}` : ""}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-bold text-gray-600">
            MERGE INTO IT (this record is retired)
            <select
              value={loseId}
              onChange={(e) => { setLoseId(e.target.value); setPreview(null); setResult(null); const next = active.find((c) => c.id === e.target.value); if (next && keep) scanLinks(next); }}
              disabled={busy}
              className="mt-1 w-full h-9 px-2 border border-gray-300 rounded text-sm font-normal"
            >
              <option value="">Select customer…</option>
              {active.filter((c) => c.id !== keepId).map((c) => <option key={c.id} value={c.id}>{name(c)}{masterLabel(c) ? ` — ${masterLabel(c)}` : ""}</option>)}
            </select>
          </label>
          {keep && lose && !result && (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <span className="truncate">{name(lose)}</span>
                <ArrowRight className="w-3 h-3 shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="truncate text-emerald-800">{name(keep)}</span>
              </div>
              {(keep?.master_account || lose?.master_account || preview?.master_account) && (
                <div className="text-[10px] text-gray-600">
                  <div>Loser account: {preview?.lose?.master_account || masterLabel(lose) || "—"}</div>
                  <div>Winner account: {preview?.keep?.master_account || masterLabel(keep) || "—"}</div>
                  {preview?.master_account?.note && <div className="text-emerald-800 font-semibold">{preview.master_account.note}</div>}
                </div>
              )}
              {scanning && <p role="status" className="flex items-center gap-1.5 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Checking linked records…</p>}
              {preview?.ok && (
                <>
                  <p>Will relink <strong>{preview.linked_total}</strong> record{preview.linked_total === 1 ? "" : "s"} across <strong>{linkedRows.length}</strong> record type{linkedRows.length === 1 ? "" : "s"}.</p>
                  {linkedRows.length > 0 && (
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-600 max-h-28 overflow-y-auto" aria-label="Linked records by type">
                      {linkedRows.map((e) => <li key={e.entity} className="flex justify-between gap-2"><span className="truncate">{e.label}</span><span className="font-semibold">{e.linked}</span></li>)}
                    </ul>
                  )}
                  {Array.isArray(preview.warnings) && preview.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1 text-[10px] text-amber-700"><AlertTriangle className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />{w}</p>
                  ))}
                </>
              )}
              {preview && !preview.ok && preview.reason && <p className="text-red-600">{preview.reason}</p>}
            </div>
          )}
          {result && (
            <div className={`rounded border px-3 py-2 text-[11px] space-y-1.5 ${done ? "border-emerald-300 bg-emerald-50 text-emerald-900" : partial ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-700"}`} aria-live="polite">
              <p className="flex items-center gap-1.5 font-bold">
                {done ? <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> : <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
                {done && result.status === "already_merged" && "Already merged — no changes were needed."}
                {done && result.status === "merged" && `Merged — ${result.relinked_total ?? 0} record${result.relinked_total === 1 ? "" : "s"} relinked; the loser is marked merged and inactive.`}
                {partial && "Partial merge — the loser stays live. Resume to finish."}
                {!done && !partial && "Merge finished with errors."}
              </p>
              {partial && result.reason && <p>{result.reason}</p>}
              {result.master_account?.note && <p className="text-[10px]">{result.master_account.note}</p>}
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] max-h-32 overflow-y-auto" aria-label="Merge result by record type">
                {entityRows.map((e) => (
                  <li key={e.entity} className="flex justify-between gap-2">
                    <span className="truncate">{e.label}</span>
                    <span className={`font-semibold ${e.status === "failed" ? "text-red-700" : e.status === "done" ? "text-emerald-800" : "text-gray-500"}`}>
                      {e.status === "failed" ? `failed (${e.relinked ?? 0}/${e.scanned ?? 0})` : `${e.relinked ?? e.linked ?? 0}`}
                    </span>
                  </li>
                ))}
              </ul>
              {(result.winner_warning || result.progress_warning) && (
                <p className="text-[10px] text-amber-800">{[result.winner_warning, result.progress_warning].filter(Boolean).join(" ")}</p>
              )}
            </div>
          )}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 pb-4">
          <button type="button" onClick={() => { if (!busy) onClose?.(); }} className="h-9 px-4 rounded border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50">{done ? "Close" : "Cancel"}</button>
          {!done && (
            <button
              type="button"
              onClick={confirmMerge}
              disabled={!keep?.id || !lose?.id || busy || scanning || (preview != null && !preview.ok && !preview.already_merged)}
              className="h-9 px-4 rounded bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-50"
            >
              {busy ? "Merging…" : partial ? "Resume merge" : "Merge customers"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
