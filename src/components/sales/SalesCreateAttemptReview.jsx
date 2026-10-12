import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  auditSalesSmartsheetCreateAttempts,
  auditSalesSmartsheetPermanentOwnership,
  reviewSalesSmartsheetCreateCandidate,
  recoverVerifiedSalesSmartsheetCreate,
} from "@/components/admin/smartsheetSyncPersistence";

export default function SalesCreateAttemptReview({ sessionToken }) {
  const [audit, setAudit] = useState(null);
  const [ownership, setOwnership] = useState(null);
  const [result, setResult] = useState(null);
  const [workOrderId, setWorkOrderId] = useState("");
  const [rowId, setRowId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [recovery, setRecovery] = useState(null);
  const [error, setError] = useState("");
  if (!sessionToken) return null;
  const auditOwnership = async () => {
    if(busy) return;
    setBusy(true);setError("");setOwnership(null);
    try {
      setOwnership(await auditSalesSmartsheetPermanentOwnership({sessionToken}));
    } catch(err) {
      setError(err?.message || "Permanent row ownership audit was incomplete.");
    } finally {setBusy(false);}
  };
  const load = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    setRecovery(null);
    setConfirmed(false);
    try {
      setAudit(await auditSalesSmartsheetCreateAttempts({ sessionToken }));
    } catch (err) {
      setAudit(null);
      setError(err?.message || "Cannot verify Sales creation attempts.");
    } finally {
      setBusy(false);
    }
  };
  const review = async () => {
    if (!workOrderId.trim() || !/^\d+$/.test(rowId.trim()) || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setRecovery(null);
    setConfirmed(false);
    try {
      setResult(await reviewSalesSmartsheetCreateCandidate({ sessionToken, workOrderId, rowId }));
    } catch (err) {
      setError(err?.message || "Cannot verify the selected permanent row.");
    } finally {
      setBusy(false);
    }
  };
  const canRecover = !busy && result?.classification === "verified_candidate" &&
    result?.eligible_for_future_guarded_recovery === true &&
    result?.workorder_id === workOrderId.trim() &&
    result?.entered_row_id === rowId.trim() &&
    result?.recorded_row_id === rowId.trim() &&
    Boolean(result?.workorder_version && result?.attempt_id) && !recovery;
  const recover = async () => {
    if (!canRecover || !confirmed) return;
    setBusy(true);
    setError("");
    setRecovery(null);
    try {
      const saved = await recoverVerifiedSalesSmartsheetCreate({
        sessionToken, workOrderId: result.workorder_id, rowId: result.entered_row_id,
        expectedVersion: result.workorder_version, expectedAttemptId: result.attempt_id,
      });
      setRecovery(saved);
      setResult(null);
      setConfirmed(false);
      setAudit(null);
    } catch (err) {
      setResult(null);
      setConfirmed(false);
      setError(err?.message || "Recovery was not verified. Reload the creation attempt and original WorkOrder.");
    } finally {
      setBusy(false);
    }
  };
  const note = result?.classification === "verified_candidate"
    ? "Exact recorded row ID and mapped values match. A guarded recovery is available after explicit confirmation; it rechecks all evidence and the WorkOrder version before saving."
    : result?.classification === "uncertain_attempt"
      ? "The row contents may match, but an unconfirmed POST has no trustworthy permanent row ID. Never link by matching values alone."
      : "The candidate is not verified for recovery. Review the permanent IDs and saved creation evidence; nothing was changed.";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          Sales creation recovery evidence (admin · read-only)
        </summary>
        <p className="mt-2 text-xs text-slate-600">
          Review unresolved Smartsheet creation attempts by permanent IDs. This does not write WorkOrders, retry POSTs, or repair links.
        </p>
        <Button className="mt-3" type="button" variant="outline" size="sm" disabled={busy} onClick={load}>
          {busy ? "Checking…" : "Check unresolved Sales creates"}
        </Button>
        <Button className="mt-3 ml-2" type="button" variant="outline" size="sm"
          disabled={busy} onClick={auditOwnership}>
          {busy ? "Checking…" : "Audit permanent row ownership"}
        </Button>
        {ownership && (
          <div className="mt-3 space-y-2 rounded-md border border-slate-300 p-3 text-xs" role="status">
            <p><strong>Read-only ownership review:</strong> {ownership.review_count} row identit{ownership.review_count===1?"y":"ies"} need review,
              including {ownership.competing_row_count} with competing WorkOrders.</p>
            <p>Linked records examined: {ownership.linked_records_examined};
              creation markers examined: {ownership.attempt_records_examined}.
              No uniqueness constraint has been verified.</p>
            {ownership.cases_truncated && <p className="text-amber-800">First 30 findings shown; total count covers the verified scan.</p>}
            {ownership.cases.map(item=>(
              <div key={item.row_id} className="rounded border border-amber-200 p-2 break-all">
                <strong>Permanent row {item.row_id}</strong> — {item.types.join(", ")}
                <p className="font-mono">WorkOrder IDs: {item.workorder_ids.join(", ")}{item.owners_truncated?" (more omitted)":""}</p>
              </div>
            ))}
            <p>Findings require manual permanent-ID verification. No links or production records were changed.</p>
          </div>
        )}
        {audit && (
          <div className="mt-3 space-y-2 text-xs">
            <p><strong>{audit.count}</strong> unresolved Sales create attempt(s) for sheet {audit.sheet_id}.</p>
            {audit.truncated && <p className="text-amber-800">Only the first 40 IDs are shown. No incomplete result was treated as a complete list.</p>}
            {audit.cases.map((item) => (
              <div key={item.workorder_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <span className="break-all font-mono">{item.workorder_id} · {item.status} {item.recorded_row_id && `· Row ${item.recorded_row_id}`}</span>
                <Button type="button" variant="outline" size="sm" disabled={busy}
                  onClick={() => { setWorkOrderId(item.workorder_id); setRowId(item.recorded_row_id || ""); setResult(null); setRecovery(null); setConfirmed(false); }}>
                  Inspect
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-700">WorkOrder ID
            <Input className="mt-1" value={workOrderId} onChange={(e) => { setWorkOrderId(e.target.value); setResult(null); setRecovery(null); setConfirmed(false); }}
              placeholder="Exact WorkOrder ID" />
          </label>
          <label className="text-xs text-slate-700">Smartsheet permanent row ID
            <Input className="mt-1" inputMode="numeric" value={rowId} onChange={(e) => { setRowId(e.target.value); setResult(null); setRecovery(null); setConfirmed(false); }}
              placeholder="Enter a permanent row ID" />
          </label>
        </div>
        <Button type="button" className="mt-2" variant="outline" size="sm"
          disabled={busy || !workOrderId.trim() || !/^\d+$/.test(rowId.trim())} onClick={review}>
          Inspect exact row (no changes)
        </Button>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        {recovery && <p role="status" className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
          Confirmed: WorkOrder {recovery.workorder_id} now links to permanent Smartsheet row {recovery.row_id}.
          CellHistory event {recovery.history_id} was verified. No Smartsheet write was sent.
        </p>}
        {result && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" role="status">
            <p className="font-semibold">Result: {result.classification.replaceAll("_", " ")}</p>
            <p className="mt-1">{note}</p>
            <p className="mt-1">Remote row verified: {result.remote_row_verified ? "Yes" : "No"} ·
              Mapped values agree: {result.values_match ? "Yes" : "No"} ·
              Competing claims: {result.competing_claim_count}</p>
            {result.competing_workorder_ids?.length > 0 &&
              <p className="mt-1 break-all font-mono">Other WorkOrders: {result.competing_workorder_ids.join(", ")}</p>}
            {canRecover && (
              <div className="mt-3 space-y-2 rounded-md border border-amber-300 bg-white p-3">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5" />
                  <span>I confirm that this recorded permanent Smartsheet row belongs to the original WorkOrder.
                    Recover only the verified link; do not create a new Smartsheet row.</span>
                </label>
                <Button type="button" variant="outline" size="sm"
                  disabled={!confirmed || busy} onClick={recover}>
                  {busy ? "Verifying…" : "Recover verified Sales link"}
                </Button>
              </div>
            )}
            <p className="mt-1 font-medium">Read-only inspection complete. No changes occur unless you explicitly confirm recovery.</p>
          </div>
        )}
      </details>
    </section>
  );
}
