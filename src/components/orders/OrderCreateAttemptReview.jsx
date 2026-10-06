import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

const CATEGORIES = [
  { key: "ambiguous", label: "Ambiguous outcome", description: "A POST may have succeeded, or the stored identities do not fully agree. Do not retry or clear its marker without independent reconciliation." },
  { key: "missing_row", label: "Known row missing", description: "A recorded permanent row ID was absent from a complete, single-version read of the configured Order Request sheet. Confirm access and investigate before acting." },
  { key: "verified_link", label: "Verified permanent link", description: "The marker, Base44 Order and existing Smartsheet row all have matching permanent sheet and row IDs. No automatic repair is performed." },
];
const number = (value) => (Number(value) || 0).toLocaleString();

export default function OrderCreateAttemptReview({ open, onOpenChange, sessionToken }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("ambiguous");
  const [backupReport, setBackupReport] = useState(null);
  const [backupError, setBackupError] = useState("");
  const [backupChecking, setBackupChecking] = useState(false);
  const backupRequestRef = useRef(0);
  const requestRef = useRef(0);
  const activeRef = useRef(null);

  const load = useCallback(async () => {
    if (activeRef.current !== null) return;
    const requestId = ++requestRef.current;
    activeRef.current = requestId;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      if (!sessionToken) throw new Error("An active administrator session is required.");
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "audit_order_create_attempts",
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true ||
          (data.total_markers > 0 && data.sheet_download_verified !== true)) {
        throw new Error(data?.error || "A complete read-only review could not be verified.");
      }
      if (activeRef.current !== requestId) return;
      setReport(data);
      setCategory(CATEGORIES.find(({ key }) => Number(data.counts?.[key]) > 0)?.key || "ambiguous");
    } catch (reason) {
      if (activeRef.current !== requestId) return;
      setError(reason?.response?.data?.error || reason?.data?.error || reason?.message ||
        "The Order Request comparison could not be completed.");
    } finally {
      if (activeRef.current === requestId) {
        activeRef.current = null;
        setLoading(false);
      }
    }
  }, [sessionToken]);

  const checkBackup = useCallback(async () => {
    if (!sessionToken || backupChecking) return;
    const requestId = ++backupRequestRef.current;
    setBackupChecking(true);
    setBackupError("");
    setBackupReport(null);
    try {
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "audit_order_backup_readiness",
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || data.read_only !== true) {
        throw new Error(data?.error || "Could not verify backup readiness.");
      }
      if (requestId === backupRequestRef.current) setBackupReport(data);
    } catch (error) {
      if (requestId === backupRequestRef.current) {
        setBackupError(error?.response?.data?.error || error?.message || "Backup readiness check failed.");
      }
    } finally {
      if (requestId === backupRequestRef.current) setBackupChecking(false);
    }
  }, [sessionToken, backupChecking]);

  useEffect(() => {
    if (open) {
      load();
    } else {
      // Never display an earlier review after closing or rapidly reopening.
      backupRequestRef.current++;
      setBackupReport(null);
      setBackupError("");
      setBackupChecking(false);
      activeRef.current = null;
      setLoading(false);
      setError("");
      setReport(null);
    }
  }, [open, load]);

  const selected = CATEGORIES.find(({ key }) => key === category) || CATEGORIES[0];
  const records = report?.records_by_category?.[selected.key] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] max-w-5xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-800">
            <ShieldCheck className="w-5 h-5 shrink-0 text-purple-600" />
            Smartsheet creation attempts
          </DialogTitle>
          <DialogDescription className="text-left">
            Admin-only, read-only review of Order creation markers and permanent Smartsheet row evidence.
            No markers are cleared and no rows are created, changed or deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
            Evidence only — no recovery runs automatically
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={checkBackup} disabled={backupChecking || !sessionToken}>
              {backupChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {backupChecking ? "Checking backup..." : "Check backup"}
            </Button>
          <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading || !sessionToken}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {loading ? "Checking..." : "Refresh review"}
          </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {backupError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{backupError}</p>}
          {backupReport && (
            <div role="status" className={`rounded-lg border p-3 text-sm ${backupReport.can_attempt_verified_backup
              ? "border-blue-200 bg-blue-50 text-blue-900"
              : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <p className="font-semibold">{backupReport.can_attempt_verified_backup
                ? "Drive connection ready for a backup attempt" : "Backup is not ready"}</p>
              <p className="mt-1 text-xs">
                Backup protection: {backupReport.backup_before_write ? "On" : "Off"} ·
                Drive API: {backupReport.drive_metadata_readable && backupReport.drive_listing_readable ? "Readable" : "Unavailable"} ·
                Existing archive listings: {number(backupReport.candidate_archives_found)} ·
                Order push: {backupReport.order_push_enabled ? "On" : "Off"}
              </p>
              {backupReport.reasons?.length > 0 && (
                <p className="mt-1 text-xs">{backupReport.reasons.join(" ")}</p>
              )}
              <p className="mt-1 text-xs">
                Read-only connection check. New backup upload and recovery remain unverified until a real pre-write backup succeeds.
              </p>
            </div>
          )}
          {loading && (
            <div role="status" className="flex items-center gap-3 rounded-xl bg-purple-50 p-4 text-sm text-gray-700">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-purple-600" />
              Reading Order markers and verifying Smartsheet evidence...
            </div>
          )}
          {!!error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <div><strong>Review unavailable</strong><p>{error}</p>
                <p className="mt-1">No partial results are displayed. Retry after the read is available.</p>
              </div>
            </div>
          )}
          {report && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3" aria-label="Smartsheet creation attempt totals">
                {[
                  ["Recorded attempts", report.total_markers],
                  ["Unresolved markers", report.unresolved_markers],
                  ["Retry Sync recoverable", report.retry_sync_recoverable],
                  ["Manual investigation", report.manual_investigation_required],
                  ["Ambiguous outcomes", report.counts?.ambiguous],
                  ["Known rows missing", report.counts?.missing_row],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-600">{label}</p>
                    <p className="text-xl font-bold tabular-nums text-gray-800">{number(value)}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                {report.total_markers > 0
                  ? `Verified sheet ${report.sheet_id} · version ${report.sheet_version} · ${number(report.smartsheet_rows_examined)} permanent rows inspected. ${number(report.counts?.verified_link)} marker links verified.`
                  : `No creation-attempt markers found in ${number(report.total_orders_examined)} Orders. No Smartsheet download was necessary.`}
              </p>
              {report.total_markers > 0 && (
                <>
                  <div className="space-y-1">
                    <label htmlFor="order-create-attempt-category" className="block text-sm font-semibold text-gray-700">Evidence category</label>
                    <select id="order-create-attempt-category"
                      className="min-h-11 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-800"
                      value={category} onChange={(event) => setCategory(event.target.value)}>
                      {CATEGORIES.map((item) => (
                        <option key={item.key} value={item.key}>{item.label} ({number(report.counts?.[item.key])})</option>
                      ))}
                    </select>
                    <p className="text-sm text-gray-600">{selected.description}</p>
                  </div>
                  {records.length === 0 ? (
                    <p role="status" className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">No Orders in this category.</p>
                  ) : (
                    <div className="space-y-2">
                      {records.map((item) => (
                        <div key={item.base44_record_id} className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div><p className="font-semibold text-gray-800">{item.customer_name || "Unnamed Order"}</p>
                              <p className="break-words text-xs text-gray-500">{item.description || "No description"}</p></div>
                            <span className="break-all text-xs text-gray-500">Order ID: {item.base44_record_id}</span>
                          </div>
                          <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{item.reason}</p>
                          <div className={`rounded-lg border p-2 text-sm ${item.retry_sync_recoverable
                            ? "border-green-200 bg-green-50 text-green-900"
                            : item.recovery_state === "none"
                              ? "border-blue-200 bg-blue-50 text-blue-900"
                              : "border-red-200 bg-red-50 text-red-900"}`}>
                            <p className="font-semibold">{item.retry_sync_recoverable
                              ? "Retry Sync can safely attempt recovery"
                              : item.recovery_state === "none"
                                ? "No recovery action required"
                                : "Manual Smartsheet investigation required"}</p>
                            <p className="mt-1 text-xs">{item.recommended_action}</p>
                          </div>
                          <div className="grid gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
                            <p className="break-all">Attempt ID: {item.attempt_id || "Not recorded"}</p>
                            <p>Marker status: <strong>{item.marker_status}</strong>{item.marker_needs_review ? " · unresolved" : ""}{item.deleted ? " · Order soft-deleted" : ""}</p>
                            <p>Expected create snapshot: {item.expected_snapshot_recorded ? "Recorded before POST" : "Not recorded"}</p>
                            <p>Started: {item.started_at || "Unknown"}</p>
                            <p>Linked: {item.linked_at || "Not recorded"}</p>
                            <p className="break-all">Marker sheet / row: {item.marker_sheet_id || "—"} / {item.marker_row_id || "—"}</p>
                            <p className="break-all">Base44 sheet / row: {item.base44_sheet_id || "—"} / {item.base44_row_id || "—"}</p>
                            <p>Row evidence: {item.remote_row_present === null ? "Cannot establish from current sheet" : item.remote_row_present ? "Known row present" : "Known row absent"}</p>
                          </div>
                        </div>
                      ))}
                      {report.record_lists_truncated?.[selected.key] && (
                        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                          Showing the first {number(records.length)} of {number(report.counts?.[selected.key])} records in this category.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
              <p className="text-xs text-gray-500">
                A missing row ID cannot prove a POST failed. Only a durable created_unlinked marker with an existing permanent row, expected snapshot, matching sheet, no Base44 row link, and a pending Save & Sync marker is eligible for Retry Sync recovery. All other unresolved creates require manual permanent-ID investigation.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
