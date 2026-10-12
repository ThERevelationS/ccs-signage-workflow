import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  auditSalesSmartsheetRecoveryHistory,
  acknowledgeSalesSmartsheetRecoveryHistory,
} from "@/components/admin/smartsheetSyncPersistence";

// This admin tool reconciles existing, verified history evidence only.
// It never creates a CellHistory event or changes the Smartsheet row link.
export default function SalesRecoveryHistoryReview({ sessionToken }) {
  const [workOrderId, setWorkOrderId] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (!sessionToken) return null;
  const inspect = async () => {
    if (!workOrderId.trim() || busy) return;
    setBusy(true); setError(""); setSuccess(""); setConfirmed(false); setEvidence(null);
    try {
      setEvidence(await auditSalesSmartsheetRecoveryHistory({sessionToken,workOrderId}));
    } catch (err) {
      setError(err?.message || "History evidence could not be verified.");
    } finally { setBusy(false); }
  };
  const ready = evidence?.status === "verified_event_ready" &&
    evidence.workorder_id === workOrderId.trim() &&
    Boolean(evidence?.history_event_id && evidence?.attempt_id && evidence?.workorder_version);
  const acknowledge = async () => {
    if (!ready || !confirmed || busy) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const saved = await acknowledgeSalesSmartsheetRecoveryHistory({
        sessionToken,workOrderId:evidence.workorder_id,
        expectedVersion:evidence.workorder_version,
        expectedAttemptId:evidence.attempt_id,eventId:evidence.history_event_id,
      });
      setSuccess("Verified existing CellHistory event " + saved.history_event_id +
        " was acknowledged on the original WorkOrder. No new history or Smartsheet writes occurred.");
      setEvidence(null); setConfirmed(false);
    } catch (err) {
      setError(err?.message || "History acknowledgment is uncertain. Inspect the WorkOrder again.");
      setEvidence(null); setConfirmed(false);
    } finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          Sales recovery history verification (admin)
        </summary>
        <p className="mt-2 text-xs text-slate-600">
          If a recovered Sales link reported a CellHistory failure, inspect the original WorkOrder.
          Only an existing, uniquely verified event can be acknowledged. Missing or ambiguous events remain held; none are created here.
        </p>
        <label className="mt-3 block text-xs text-slate-700">Recovered WorkOrder ID
          <Input className="mt-1" value={workOrderId} placeholder="Exact WorkOrder ID"
            onChange={(e) => {setWorkOrderId(e.target.value); setEvidence(null);setConfirmed(false);setSuccess("");}}/>
        </label>
        <Button className="mt-2" type="button" variant="outline" size="sm"
          disabled={busy || !workOrderId.trim()} onClick={inspect}>
          {busy ? "Verifying…" : "Inspect existing CellHistory"}
        </Button>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        {success && <p role="status" className="mt-2 text-xs text-emerald-800">{success}</p>}
        {evidence && (
          <div className="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">History: {evidence.status.replaceAll("_"," ")}</p>
            <p>Matching events: {evidence.history_matching_count}.
              {evidence.history_event_id ? " Verified event: " + evidence.history_event_id + "." : ""}
            </p>
            {evidence.status === "history_not_confirmed" &&
              <p>No exact event was found. A previous write may still have succeeded without an acknowledgment.
                This tool will not create a potential duplicate. Manual investigation is required.</p>}
            {evidence.status === "ambiguous_history" &&
              <p>Multiple matching events were found. Review their provenance; no automatic changes are allowed.</p>}
            {evidence.status === "already_reconciled" &&
              <p>This event has already been acknowledged on the WorkOrder.</p>}
            {ready && (
              <div className="space-y-2 rounded-md border bg-white p-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-0.5" checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}/>
                  <span>Confirm the exact existing CellHistory event.
                    Record only its acknowledgment on this WorkOrder; do not write another event.</span>
                </label>
                <Button type="button" variant="outline" size="sm"
                  disabled={!confirmed || busy} onClick={acknowledge}>
                  Acknowledge verified existing event
                </Button>
              </div>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
