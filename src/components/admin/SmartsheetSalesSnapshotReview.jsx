import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { previewSmartsheetSalesEstInv } from "@/components/admin/smartsheetSyncPersistence";

const PAGE_SIZE = 20;
const LABELS = {
  match: "Matching",
  different: "Different",
  smartsheet_only: "Smartsheet only",
  base44_only: "Base44 only",
  both_blank: "Both blank",
  row_not_returned: "Row unavailable",
};

function displayValue(value) {
  return value == null || String(value).trim() === "" ? "—" : String(value);
}

export default function SmartsheetSalesSnapshotReview({ sessionToken, savedSales, draftSales }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const savedSheet = String(savedSales?.smartsheet_sheet_id || "").trim();
  const savedColumn = String(savedSales?.column_bindings?.est_inv_at || "").trim();
  const draftSheet = String(draftSales?.smartsheet_sheet_id || "").trim();
  const draftColumn = String(draftSales?.column_bindings?.est_inv_at || "").trim();
  const mappingReady = /^\d+$/.test(savedSheet) && /^\d+$/.test(savedColumn) &&
    savedSheet === draftSheet && savedColumn === draftColumn;
  const canPreview = Boolean(sessionToken && mappingReady);

  // Never show values from a different saved mapping or a previous login.
  useEffect(() => {
    requestRef.current += 1;
    setResult(null);
    setError("");
    setBusy(false);
  }, [sessionToken, savedSheet, savedColumn, draftSheet, draftColumn]);

  const load = async (offset = 0) => {
    if (!canPreview || busy) return;
    const requestId = ++requestRef.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const preview = await previewSmartsheetSalesEstInv({
        sessionToken, sampleOffset: offset, sampleSize: PAGE_SIZE,
      });
      if (requestId !== requestRef.current) return;
      if (String(preview.sheet_id) !== savedSheet || String(preview.column_id) !== savedColumn ||
          preview.sample_is_complete_archive !== false ||
          !Number.isInteger(preview.sample_offset) || preview.sample_offset !== offset) {
        throw new Error("The saved Sales mapping changed or the preview could not be verified. Reload settings.");
      }
      setResult(preview);
    } catch (cause) {
      if (requestId === requestRef.current) {
        setError(cause?.message || "The read-only preview could not be loaded.");
      }
    } finally {
      if (requestId === requestRef.current) setBusy(false);
    }
  };

  const offset = result?.sample_offset || 0;
  const cases = Array.isArray(result?.cases) ? result.cases : [];
  const candidates = result?.candidate_count_in_push_window || 0;

  return (
    <section className="rounded-xl border border-blue-200 bg-white p-3 sm:p-4 space-y-3" aria-label="Sales Est / Inv snapshot review">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Sales Est / Inv # snapshot review</h3>
            <Badge variant="outline" className="border-blue-200 text-blue-700">Read-only</Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            Compare saved Base44 values with live Smartsheet cells for linked records missing the
            Est / Inv # snapshot. This does not sync, backfill, approve, or change any records.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Only the current 500-record Sales push window is examined, not the full historical archive.
            Other linked fields and duplicate relationships still require separate review.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0"
          onClick={() => load(0)} disabled={!canPreview || busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
            result ? <RefreshCw className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
          {result ? "Refresh preview" : "Preview 20 records"}
        </Button>
      </div>

      {!mappingReady && (
        <p className="text-xs text-amber-800" role="status">
          Save and reload the Sales sheet ID and Est / Inv # mapping before previewing.
          Unsaved mapping changes cannot be used for this comparison.
        </p>
      )}
      {mappingReady && !sessionToken && (
        <p role="status" className="text-xs text-amber-800">An admin sign-in session is required.</p>
      )}
      {error && <p role="alert" className="flex items-start gap-2 text-xs text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
      </p>}
      {result && (
        <div className="space-y-3" aria-live="polite">
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
            <strong>{candidates.toLocaleString()}</strong> linked records with missing Est / Inv #
            snapshots among <strong>{result.push_window_examined.toLocaleString()}</strong> records
            examined in the current push window. Displaying {cases.length ? offset + 1 : 0}–
            {offset + cases.length} of these candidates.
          </div>
          {result.verified_column_title && (
            <p className="text-xs text-blue-800">Confirmed Smartsheet column: <strong>{result.verified_column_title}</strong></p>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(result.summary || {}).map(([key, count]) => (
              <Badge key={key} variant="outline">{LABELS[key] || key}: {count}</Badge>
            ))}
          </div>
          {cases.length === 0 ? (
            <p className="text-xs text-gray-600">No matching review candidates in this sample.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {cases.map((item) => (
                <div key={item.workorder_id} className="min-w-0 rounded-lg border border-gray-200 p-3 text-xs space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-semibold break-words text-gray-900">{displayValue(item.client_name)}</span>
                    <Badge variant="outline">{LABELS[item.comparison] || "Needs review"}</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="min-w-0"><div className="text-gray-500">Base44 Est / Inv #</div>
                      <div className="break-all font-medium text-gray-900">{displayValue(item.base44_est_inv_at)}</div>
                    </div>
                    <div className="min-w-0"><div className="text-gray-500">Smartsheet Est / Inv #</div>
                      <div className="break-all font-medium text-gray-900">{displayValue(item.smartsheet_est_inv_at)}</div>
                    </div>
                  </div>
                  {item.duplicate_link_in_push_window && (
                    <p className="font-medium text-amber-700">Multiple records share this Smartsheet row ID in the current window.</p>
                  )}
                  <div className="break-all text-[11px] text-gray-500">
                    WorkOrder: {item.workorder_id} · Smartsheet row: {item.smartsheet_row_id}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-500">Review only. No changes will be applied.</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="min-h-11"
                disabled={busy || !canPreview || offset === 0}
                onClick={() => load(Math.max(0, offset - PAGE_SIZE))}>Previous</Button>
              <Button type="button" size="sm" variant="outline" className="min-h-11"
                disabled={busy || !canPreview || result.next_sample_offset == null}
                onClick={() => load(result.next_sample_offset)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
