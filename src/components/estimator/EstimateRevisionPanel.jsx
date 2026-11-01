import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, History, LockKeyhole, PencilLine, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isEstimateProtected, requiresEstimateLifecycleReason, summarizeEstimateChanges } from "./estimateLifecycle";
import { listEstimateRevisions, revertEstimateToRevision } from "./estimateRevisionService";
import { staffEntities } from "@/components/staff/staffEntities";

const TYPE_LABELS = {
  manual_revision: "Manual revision",
  status_transition: "Status transition",
  cancel: "Cancellation",
  conversion: "Work Order conversion",
};

// (#201) Two-column snapshot grid — mirrors the exact field coverage of
// summarizeEstimateChanges (status/version/totals, quote settings,
// estimate details) plus the section count, so a reviewer sees before→after
// VALUES, not just the bullet summary. Only fields that differ render.
const SNAPSHOT_GRID_FIELDS = [
  ["status", "Status", (v) => v || "draft"],
  ["quote_version", "Quote version", (v) => (Number(v) || 0) > 0 ? `Version ${Number(v)}` : "—"],
  ["quote_issue_date", "Quote issue date", (v) => v || "—"],
  ["quote_total", "Customer quote total", (v) => `$${Number(v || 0).toFixed(2)}`],
  ["total_cost", "Internal cost", (v) => `$${Number(v || 0).toFixed(2)}`],
  ["line_items", "Estimate sections", (v) => `${(Array.isArray(v) ? v : []).length}`],
  ["work_order_id", "Work Order link", (v) => v ? String(v).slice(0, 12) : "—"],
  ["project_name", "Project", (v) => v || "—"],
  ["client_name", "Client", (v) => v || "—"],
  ["customer_id", "Customer link", (v) => v ? String(v).slice(0, 12) : "—"],
  ["po_number", "PO number", (v) => v || "—"],
  ["site_address", "Site address", (v) => v || "—"],
  ["order_contact", "Order contact", (v) => v || "—"],
  ["contact_email", "Contact email", (v) => v || "—"],
  ["contact_phone", "Contact phone", (v) => v || "—"],
  ["salesperson", "Salesperson", (v) => v || "—"],
  ["target_install_date", "Target install date", (v) => v || "—"],
  ["priority", "Priority", (v) => v || "—"],
  ["discount_percent", "Discount %", (v) => `${Number(v || 0)}%`],
  ["contingency_percent", "Contingency %", (v) => `${Number(v || 0)}%`],
  ["tax_percent", "Tax %", (v) => `${Number(v || 0)}%`],
  ["deposit_percent", "Deposit %", (v) => `${Number(v || 0)}%`],
  ["shipping_fee", "Shipping fee", (v) => `$${Number(v || 0).toFixed(2)}`],
  ["permit_fee", "Permit fee", (v) => `$${Number(v || 0).toFixed(2)}`],
  ["quote_title", "Quote title", (v) => v || "—"],
  ["payment_terms", "Payment terms", (v) => v || "—"],
  ["lead_time_text", "Lead time", (v) => v || "—"],
];

function SnapshotCompareGrid({ before, after, afterLabel = "Current estimate", active = false }) {
  if (!before || typeof before !== "object" || !after || typeof after !== "object") return null;
  const rows = SNAPSHOT_GRID_FIELDS
    .filter(([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(([key, label, fmt]) => ({ key, label, before: fmt(before[key]), after: fmt(after[key]) }));
  if (!rows.length) return null;
  const cell = active ? "text-blue-800" : "text-gray-600";
  return (
    <div className={`mt-1.5 rounded border ${active ? "border-blue-200 bg-white" : "border-gray-200 bg-gray-50"} overflow-hidden`}>
      <div className={`grid grid-cols-[110px_1fr_1fr] px-2 py-1 text-[8px] font-bold tracking-wide ${active ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
        <span>FIELD</span><span>BEFORE SNAPSHOT</span><span>{afterLabel.toUpperCase()}</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className={`grid grid-cols-[110px_1fr_1fr] px-2 py-1 border-t text-[9px] ${active ? "border-blue-100" : "border-gray-100"}`}>
          <span className="font-semibold text-gray-500 pr-2">{row.label}</span>
          <span className="text-red-700/80 break-words pr-2">{row.before}</span>
          <span className={`${cell} break-words`}>{row.after}</span>
        </div>
      ))}
    </div>
  );
}

function SnapshotDiffToggle({ lines, expanded, onToggle, active = false, before = null, after = null, afterLabel = "Current estimate" }) {
  if (!lines.length && !(before && after)) return null;
  return (
    <div className="mt-1.5">
      <button type="button" onClick={onToggle} className={`inline-flex items-center gap-1 text-[9px] font-bold ${active ? "text-blue-700 hover:text-blue-900" : "text-gray-500 hover:text-gray-700"}`}>
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Changes vs snapshot
      </button>
      {expanded && (
        <div>
          {lines.length > 0 && (
            <ul className={`mt-1 list-disc pl-4 space-y-0.5 text-[9px] ${active ? "text-blue-800" : "text-gray-600"}`}>
              {lines.map((line, index) => (<li key={index}>{line}</li>))}
            </ul>
          )}
          <SnapshotCompareGrid before={before} after={after} afterLabel={afterLabel} active={active} />
        </div>
      )}
    </div>
  );
}

export default function EstimateRevisionPanel({ estimate, persistedEstimate, openRevision, onStartRevision, onChange, onRetryPipelineSync, retryingPipelineSync = false, onRepairConversionTracking, repairingConversionTracking = false, refreshKey = 0, sessionToken = "", onReverted }) {
  const [rows, setRows] = useState([]);
  const [revisionsLoading, setRevisionsLoading] = useState(true);
  const [revisionReadError, setRevisionReadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [diffExpanded, setDiffExpanded] = useState(true);
  const [revertingId, setRevertingId] = useState("");

  const reloadRevisions = () => {
    let stale = false;
    setRevisionsLoading(true);
    listEstimateRevisions(estimate?.id, { strict: true })
      .then((result) => { if (!stale) setRows(result || []); })
      .catch((err) => { if (!stale) setRevisionReadError(err?.message || "Revision history could not be loaded."); })
      .finally(() => { if (!stale) setRevisionsLoading(false); });
    return () => { stale = true; };
  };

  useEffect(() => {
    setRevisionReadError("");
    return reloadRevisions();
  }, [estimate?.id, refreshKey, openRevision?.id, openRevision?.revision_status]);

  const persistedStatus = persistedEstimate?.status || estimate?.status || "draft";
  const protectedEstimate = isEstimateProtected(persistedStatus);
  const cancelledEstimate = persistedStatus === "cancelled";
  const canStartRevision = protectedEstimate && !cancelledEstimate && !openRevision && !estimate?.pipeline_sync_pending;
  const pendingTransitionReason = !openRevision && requiresEstimateLifecycleReason(persistedStatus, estimate?.status);
  const conversionIdempotencyKey = estimate?.work_order_id ? `work_order_conversion:${estimate.work_order_id}` : "";
  const hasConversionTracking = !conversionIdempotencyKey || rows.some((row) =>
    row.revision_status === "completed" &&
    row.revision_type === "conversion" &&
    (row.idempotency_key === conversionIdempotencyKey || row.notes === conversionIdempotencyKey || row.work_order_id === estimate.work_order_id)
  );
  const conversionTrackingMissing = !revisionsLoading && !revisionReadError && !!estimate?.work_order_id && !hasConversionTracking;

  // Live diff preview: the open revision when one exists, otherwise the most
  // recent history row. The snapshot is compared against the current estimate
  // so an in-progress revision shows what has changed so far.
  const wantVersion = (() => { try { return Number(new URLSearchParams(window.location.search).get("version")) || 0; } catch { return 0; } })();
  const snapshotDiffRevision = openRevision || (wantVersion ? rows.find((r) => Number(r.revision_number) === wantVersion) : null) || rows[0] || null;
  let snapshotDiffLines = [];
  try {
    if (snapshotDiffRevision?.estimate_snapshot_before && estimate) {
      snapshotDiffLines = summarizeEstimateChanges(snapshotDiffRevision.estimate_snapshot_before, estimate) || [];
    }
  } catch (diffError) {
    snapshotDiffLines = [];
  }

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["revision_number", "type", "status", "reason", "previous_status", "new_status", "quote_version", "previous_quote_total", "new_quote_total", "created_by", "completed_at"];
    const lines = [header.join(",")].concat(rows.map((r) => [
      r.revision_number, r.revision_type, r.revision_status, r.reason,
      r.previous_status, r.new_status, r.quote_version,
      r.previous_quote_total, r.new_quote_total, r.created_by,
      r.completed_at || r.started_at || "",
    ].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `estimate-${estimate?.estimate_number || estimate?.id || "revisions"}-revisions.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  // (#205) Guarded revert — restores the row's before-snapshot through the
  // same updated_date CAS used by normal saves; a concurrent edit aborts
  // the revert before anything is written, and the revert lands as a new
  // completed revision so the audit trail stays forward-only.
  const revertTo = async (row) => {
    if (revertingId || !row?.estimate_snapshot_before) return;
    const ok = window.confirm(
      `Revert this estimate to the snapshot recorded before revision #${row.revision_number ?? "?"}?\n\n` +
      `Snapshot reason: ${row.reason || "none recorded"}\n\n` +
      "All fields captured by that snapshot will be restored, and the revert itself is recorded as a new revision.",
    );
    if (!ok) return;
    setRevertingId(row.id);
    try {
      const result = await revertEstimateToRevision({
        estimateId: estimate?.id,
        revisionId: row.id,
        sessionToken,
        // Staff sessions write through the gateway — the base44 entity client
        // only works for platform-authenticated users on this backend-RLS
        // entity.
        entity: sessionToken ? staffEntities.AllInOneEstimate : undefined,
      });
      reloadRevisions();
      onReverted?.(result);
      window.alert(`Estimate reverted to the revision #${row.revision_number ?? "?"} snapshot.`);
    } catch (err) {
      window.alert(err?.message || "The estimate could not be reverted.");
    } finally {
      setRevertingId("");
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
        {revisionReadError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] text-red-700">
            <strong>Revision history could not be verified.</strong> {revisionReadError} Repair actions are disabled until the audit history loads successfully.
          </div>
        )}

        {conversionTrackingMissing && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-rose-700 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-rose-900">Work Order conversion tracking incomplete</div>
                <div className="text-[10px] text-rose-800 mt-0.5">The estimate is already linked to Work Order {estimate.work_order_id}, but its conversion lifecycle revision is missing. Repairing this adds only the missing audit row; it does not change the estimate, pricing, or Work Order.</div>
              </div>
            </div>
            <button type="button" onClick={onRepairConversionTracking} disabled={repairingConversionTracking} className="h-[30px] px-3 rounded border border-rose-300 bg-white text-[10px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap">
              <RefreshCw className={`w-3.5 h-3.5 ${repairingConversionTracking ? "animate-spin" : ""}`} /> {repairingConversionTracking ? "Repairing…" : "Repair Conversion Tracking"}
            </button>
          </div>
        )}

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
            <div className="min-w-0"><div className="text-[11px] font-bold text-blue-900">Revision #{openRevision.revision_number} in progress</div><div className="text-[10px] text-blue-800 mt-0.5">Reason: {openRevision.reason}</div><div className="text-[9px] text-blue-600 mt-1">Save the estimate when finished. The completed revision will preserve the before/after snapshots and change summary.</div><SnapshotDiffToggle lines={snapshotDiffLines} expanded={diffExpanded} onToggle={() => setDiffExpanded((value) => !value)} active before={openRevision?.estimate_snapshot_before} after={estimate} /></div>
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
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
              <span className="text-[9px] font-bold tracking-wide text-gray-500">REVISION HISTORY · {rows.length}</span>
              <button type="button" onClick={exportCsv} className="h-[22px] px-2 rounded border border-gray-300 bg-white text-[9px] font-semibold text-gray-600 hover:border-lime-400 hover:text-gray-900">Export CSV</button>
            </div>
            {rows.slice(0, 6).map((row) => (
              <div key={row.id} className="px-3 py-2.5 border-b border-gray-100 last:border-b-0 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><span className="text-[10px] font-bold text-gray-900">#{row.revision_number} · {TYPE_LABELS[row.revision_type] || row.revision_type || "Revision"}</span><span className={`ml-2 text-[8px] px-1.5 py-0.5 rounded border ${row.revision_status === "open" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{row.revision_status || "completed"}</span></div>
                  <div className="text-[9px] text-gray-400 whitespace-nowrap">{row.completed_at || row.started_at ? new Date(row.completed_at || row.started_at).toLocaleString() : ""}</div>
                </div>
                <div className="mt-1 text-[10px] text-gray-600">{row.reason}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-gray-400"><span>{row.previous_status || "draft"} → {row.new_status || row.previous_status || "draft"}</span>{Number(row.quote_version || 0) > 0 && <span>Quote Version {Number(row.quote_version)}</span>}<span>Quote ${Number(row.previous_quote_total || 0).toFixed(2)} → ${Number(row.new_quote_total || 0).toFixed(2)}</span>{row.created_by && <span>by {row.created_by}</span>}{row.work_order_id && <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Work Order linked</span>}</div>
                {(row.change_summary || []).length > 0 && <div className="mt-1 text-[9px] text-gray-500">{row.change_summary.join(" · ")}</div>}
                {!openRevision && row.id === snapshotDiffRevision?.id && (
                  <SnapshotDiffToggle
                    lines={snapshotDiffLines}
                    expanded={diffExpanded}
                    onToggle={() => setDiffExpanded((value) => !value)}
                    before={snapshotDiffRevision?.estimate_snapshot_before}
                    after={estimate}
                  />
                )}
                {row.revision_status === "completed" && row.estimate_snapshot_before && !openRevision && !cancelledEstimate && (
                  <button
                    type="button"
                    onClick={() => revertTo(row)}
                    disabled={!!revertingId}
                    className="mt-1.5 inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[8px] font-bold text-gray-500 hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
                    title="Restore this snapshot through a concurrency-guarded save; the revert is recorded as a new revision."
                  >
                    <RotateCcw className={`w-2.5 h-2.5 ${revertingId === row.id ? "animate-spin" : ""}`} />
                    {revertingId === row.id ? "Reverting…" : `Revert to #${row.revision_number ?? "?"}`}
                  </button>
                )}
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
            <div className="flex flex-wrap gap-1.5">{["Client request", "Correction", "Scope change", "Price update", "Site conditions"].map((preset) => <button type="button" key={preset} type="button" onClick={() => setReason((current) => current.trim() ? `${current.trim().replace(/\.*$/, "")} — ${preset}` : preset)} className="px-2 py-1 rounded border border-gray-300 bg-gray-50 text-[9px] font-semibold text-gray-600 hover:border-lime-400 hover:text-gray-900">{preset}</button>)}</div>
            {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}
            <div className="flex justify-end gap-2"><button type="button" disabled={starting} onClick={() => setDialogOpen(false)} className="h-[32px] px-4 rounded border border-gray-300 bg-white text-[11px] font-semibold text-gray-600">Cancel</button><button type="button" disabled={starting || !reason.trim()} onClick={start} className="h-[32px] px-4 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-50">{starting ? "Starting…" : "Start Revision"}</button></div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}