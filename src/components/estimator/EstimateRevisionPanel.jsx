import { useEffect, useState } from "react";
import { History, LockKeyhole, PencilLine, RefreshCw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isEstimateProtected, requiresEstimateLifecycleReason } from "./estimateLifecycle";
import { listEstimateRevisions } from "./estimateRevisionService";

const TYPE_LABELS = {
  manual_revision: "Manual revision",
  status_transition: "Status transition",
  cancel: "Cancellation",
  conversion: "Work Order conversion",
};

export default function EstimateRevisionPanel({ estimate, persistedEstimate, openRevision, onStartRevision, onChange, onRetryPipelineSync, retryingPipelineSync = false, refreshKey = 0 }) {
  const [rows, setRows] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listEstimateRevisions(estimate?.id).then((result) => active && setRows(result || []));
    return () => { active = false; };
  }, [estimate?.id, refreshKey, openRevision?.id, openRevision?.revision_status]);

  const persistedStatus = persistedEstimate?.status || estimate?.status || "draft";
  const protectedEstimate = isEstimateProtected(persistedStatus);
  const cancelledEstimate = persistedStatus === "cancelled";
  const canStartRevision = protectedEstimate && !cancelledEstimate && !openRevision;
  const pendingTransitionReason = !openRevision && requiresEstimateLifecycleReason(persistedStatus, estimate?.status);

  const start = async () => {
    if (!reason.trim() || starting) return;
    setStarting(true);
    setError("");
    try {
      await onStartRevision?.(reason.trim());
      setDialogOpen(false);
      setReason("");
    } catch (err) {
      setError(err?.message || "Revision could not be started.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-bold text-gray-900 flex items-center gap-2"><History className="w-4 h-4 text-red-600" /> Estimate Revision History</div>
          <div className="mt-0.5 text-[10px] text-gray-500">Whole-estimate lifecycle history. Product price revisions remain in each Product's Price History.</div>
        </div>
        {canStartRevision && (
          <button type="button" onClick={() => { setDialogOpen(true); setError(""); }} className="h-[31px] px-3 rounded border border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-800 hover:bg-amber-100 inline-flex items-center gap-1.5">
            <PencilLine className="w-3.5 h-3.5" /> Revise Estimate
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {estimate?.pipeline_sync_pending && (
          <div className="rounded border border-orange-300 bg-orange-50 px-3 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
              <RefreshCw className="w-4 h-4 text-orange-700 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-orange-900">Sales Pipeline synchronization pending</div>
                <div className="text-[10px] text-orange-800 mt-0.5">The estimate and lifecycle history are saved. Only the shared Customer / Sales Pipeline synchronization needs to be retried.</div>
                {estimate.pipeline_sync_error && <div className="text-[9px] text-orange-700 mt-1 break-words">Last error: {estimate.pipeline_sync_error}</div>}
              </div>
            </div>
            <button type="button" onClick={onRetryPipelineSync} disabled={retryingPipelineSync} className="h-[30px] px-3 rounded border border-orange-300 bg-white text-[10px] font-bold text-orange-800 hover:bg-orange-100 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap">
              <RefreshCw className={`w-3.5 h-3.5 ${retryingPipelineSync ? "animate-spin" : ""}`} /> {retryingPipelineSync ? "Retrying…" : "Retry Pipeline Sync"}
            </button>
          </div>
        )}

        {protectedEstimate && !openRevision && (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
            <LockKeyhole className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div><div className="text-[11px] font-bold text-amber-900">{cancelledEstimate ? "Cancelled estimate · permanently locked" : "Protected estimate"}</div><div className="text-[10px] text-amber-800 mt-0.5">{cancelledEstimate ? "This cancelled estimate remains available for history and reference, but cannot be reopened for editing." : `This ${persistedStatus} estimate is read-only. Start a revision with a reason before changing Products, pricing, customer details, or quote settings.`}</div></div>
          </div>
        )}

        {openRevision && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2.5 flex items-start gap-2">
            <PencilLine className="w-4 h-4 text-blue-700 mt-0.5 flex-shrink-0" />
            <div className="min-w-0"><div className="text-[11px] font-bold text-blue-900">Revision #{openRevision.revision_number} in progress</div><div className="text-[10px] text-blue-800 mt-0.5">Reason: {openRevision.reason}</div><div className="text-[9px] text-blue-600 mt-1">Save the estimate when finished. The completed revision will preserve the before/after snapshots and change summary.</div></div>
          </div>
        )}

        {pendingTransitionReason && (
          <label className="block rounded border border-lime-200 bg-lime-50 px-3 py-2.5 text-[10px] font-bold tracking-wide text-gray-700">
            REASON FOR STATUS CHANGE TO {String(estimate.status || "").toUpperCase()}
            <textarea
              value={estimate.edit_reason || ""}
              onChange={(event) => onChange?.({ edit_reason: event.target.value })}
              rows={2}
              placeholder="Required before this lifecycle change can be saved..."
              className="mt-1.5 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-[11px] font-normal text-gray-800 resize-y"
            />
          </label>
        )}

        {rows.length === 0 ? (
          <div className="py-3 text-center text-[10px] text-gray-400">No estimate-level revisions have been recorded yet.</div>
        ) : (
          <div className="border border-gray-200 rounded overflow-hidden">
            {rows.slice(0, 6).map((row) => (
              <div key={row.id} className="px-3 py-2.5 border-b border-gray-100 last:border-b-0 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><span className="text-[10px] font-bold text-gray-900">#{row.revision_number} · {TYPE_LABELS[row.revision_type] || row.revision_type || "Revision"}</span><span className={`ml-2 text-[8px] px-1.5 py-0.5 rounded border ${row.revision_status === "open" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{row.revision_status || "completed"}</span></div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap">{row.completed_at || row.started_at ? new Date(row.completed_at || row.started_at).toLocaleString() : ""}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-600">{row.reason}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400"><span>{row.previous_status || "draft"} → {row.new_status || row.previous_status || "draft"}</span>{Number(row.quote_version || 0) > 0 && <span>Quote Version {Number(row.quote_version)}</span>}<span>Quote ${Number(row.previous_quote_total || 0).toFixed(2)} → ${Number(row.new_quote_total || 0).toFixed(2)}</span>{row.work_order_id && <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Work Order linked</span>}</div>
                {(row.change_summary || []).length > 0 && <div className="mt-1 text-[9px] text-gray-500">{row.change_summary.join(" · ")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(next) => !starting && setDialogOpen(next)}>
        <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden border-gray-300 shadow-xl">
          <DialogHeader className="px-5 py-4 bg-[#424242] text-white border-b-4 border-lime-300">
            <DialogTitle className="text-white text-[16px] flex items-center gap-2"><PencilLine className="w-5 h-5 text-lime-300" /> Revise Protected Estimate</DialogTitle>
            <p className="mt-1 text-[10px] text-gray-300">A before-snapshot is recorded as soon as the revision starts. This protects the audit trail even if the browser closes before the revision is saved.</p>
          </DialogHeader>
          <div className="p-5 space-y-4 bg-white">
            <label className="block text-[10px] font-bold tracking-wide text-gray-500">REVISION REASON<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="What needs to change and why?" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-[12px] font-normal text-gray-800 resize-y" /></label>
            {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2"><button type="button" disabled={starting} onClick={() => setDialogOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button><button type="button" disabled={starting || !reason.trim()} onClick={start} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">{starting ? "Starting…" : "Start Revision"}</button></div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
