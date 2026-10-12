import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  auditSalesSmartsheetCreateAttempts,
  reviewSalesSmartsheetCreateCandidate,
} from "@/components/admin/smartsheetSyncPersistence";

export default function SalesCreateAttemptReview({ sessionToken }) {
  const [audit, setAudit] = useState(null);
  const [result, setResult] = useState(null);
  const [workOrderId, setWorkOrderId] = useState("");
  const [rowId, setRowId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!sessionToken) return null;
  const load = async () => {
    setBusy(true);
    setError("");
    setResult(null);
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
    try {
      setResult(await reviewSalesSmartsheetCreateCandidate({ sessionToken, workOrderId, rowId }));
    } catch (err) {
      setError(err?.message || "Cannot verify the selected permanent row.");
    } finally {
      setBusy(false);
    }
  };
  const note = result?.classification === "verified_candidate"
    ? "Exact recorded row ID and saved mapped values match. This is read-only evidence for a future guarded recovery; no link was changed."
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
        {audit && (
          <div className="mt-3 space-y-2 text-xs">
            <p><strong>{audit.count}</strong> unresolved Sales create attempt(s) for sheet {audit.sheet_id}.</p>
            {audit.truncated && <p className="text-amber-800">Only the first 40 IDs are shown. No incomplete result was treated as a complete list.</p>}
            {audit.cases.map((item) => (
              <div key={item.workorder_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <span className="break-all font-mono">{item.workorder_id} · {item.status} {item.recorded_row_id && `· Row ${item.recorded_row_id}`}</span>
                <Button type="button" variant="outline" size="sm" disabled={busy}
                  onClick={() => { setWorkOrderId(item.workorder_id); setRowId(item.recorded_row_id || ""); setResult(null); }}>
                  Inspect
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-700">WorkOrder ID
            <Input className="mt-1" value={workOrderId} onChange={(e) => { setWorkOrderId(e.target.value); setResult(null); }}
              placeholder="Exact WorkOrder ID" />
          </label>
          <label className="text-xs text-slate-700">Smartsheet permanent row ID
            <Input className="mt-1" inputMode="numeric" value={rowId} onChange={(e) => { setRowId(e.target.value); setResult(null); }}
              placeholder="Enter a permanent row ID" />
          </label>
        </div>
        <Button type="button" className="mt-2" variant="outline" size="sm"
          disabled={busy || !workOrderId.trim() || !/^\d+$/.test(rowId.trim())} onClick={review}>
          Inspect exact row (no changes)
        </Button>
        {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
        {result && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950" role="status">
            <p className="font-semibold">Result: {result.classification.replaceAll("_", " ")}</p>
            <p className="mt-1">{note}</p>
            <p className="mt-1">Remote row verified: {result.remote_row_verified ? "Yes" : "No"} ·
              Mapped values agree: {result.values_match ? "Yes" : "No"} ·
              Competing claims: {result.competing_claim_count}</p>
            {result.competing_workorder_ids?.length > 0 &&
              <p className="mt-1 break-all font-mono">Other WorkOrders: {result.competing_workorder_ids.join(", ")}</p>}
            <p className="mt-1 font-medium">Read-only check complete. No relinking or writes attempted.</p>
          </div>
        )}
      </details>
    </section>
  );
}
