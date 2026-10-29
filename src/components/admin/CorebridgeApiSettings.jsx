import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ClipboardCheck, Download, FileSpreadsheet, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";

// The legacy component name is retained because AdminSettings already mounts it.
// This page does not call CoreBridge, Gmail, or any historical importer.
export default function CorebridgeApiSettings({ sessionToken }) {
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditReport, setAuditReport] = useState(null);
  const [verifyingBackup, setVerifyingBackup] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [backupComparison, setBackupComparison] = useState(null);
  const [logRows, setLogRows] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logStatus, setLogStatus] = useState("all");

  const loadLog = async () => {
    if (logLoading) return;
    setLogLoading(true); setLogError("");
    try {
      const rows = await staffEntities.CorebridgeLog.filter({}, "-run_at", 50);
      setLogRows(Array.isArray(rows) ? rows : []);
    } catch (e) { setLogError(e?.message || "Log could not be loaded."); }
    finally { setLogLoading(false); }
  };
  const visibleLogs = (logRows || []).filter((r) => {
    if (logStatus !== "all" && r.status !== logStatus) return false;
    if (logSearch.trim()) {
      const q = logSearch.trim().toLowerCase();
      const hay = `${r.status || ""} ${r.trigger || ""} ${r.error_message || ""} ${r.run_at || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const verifyBackup = async () => {
    if (!sessionToken || busy || auditing || verifyingBackup) return;
    setVerifyingBackup(true);
    setBackupError("");
    setBackupComparison(null);
    try {
      const response = await base44.functions.invoke("corebridgeApiAction", {
        action: "verify_sept22_backup",
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || !data?.comparison?.backup_file_verified) {
        throw new Error(data?.error || "The original backup file could not be verified.");
      }
      setBackupComparison(data.comparison);
    } catch (err) {
      setBackupError(err?.response?.data?.error || err?.message || "Backup comparison failed safely.");
    } finally {
      setVerifyingBackup(false);
    }
  };

  const runAudit = async () => {
    if (!sessionToken || busy || auditing || verifyingBackup) return;
    setAuditing(true);
    setAuditError("");
    setAuditReport(null);
    try {
      const response = await base44.functions.invoke("corebridgeApiAction", {
        action: "audit_workorders",
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || !data?.audit) throw new Error(data?.error || "The full job audit could not be verified.");
      if (!data?.history) throw new Error('Historical backup metadata was not fully verified.');
      setAuditReport({ ...data.audit, history: data.history, audited_at: data.audited_at });
    } catch (err) {
      setAuditError(err?.response?.data?.error || err?.message || "The job audit could not be completed.");
    } finally {
      setAuditing(false);
    }
  };

  const exportJobs = async () => {
    if (!sessionToken || busy || auditing || verifyingBackup) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await base44.functions.invoke("corebridgeApiAction", {
        action: "export_jobs_csv",
        scope,
        session_token: sessionToken,
      });
      const data = response?.data || response;
      if (!data?.success || typeof data?.csv !== "string") {
        throw new Error(data?.error || "The complete export could not be verified.");
      }
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = data.filename || "ccs-job-register.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      setResult({ exported: data.exported_count, total: data.source_count });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Job register export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            CoreBridge Migration Â· CCS Native Reports
          </h2>
          <Badge className="bg-green-100 text-green-800">API-FREE</Badge>
          <Badge variant="outline">ADMIN ONLY</Badge>
        </div>
        <p className="text-sm text-gray-600">
          CoreBridge API calls and the old email importer are retired. Export your current CCS
          WorkOrder register directly from Base44 without a CoreBridge subscription.
          The export is read-only and keeps existing estimate/invoice numbers and historical links
          in separate columns. Internal job costs are never included.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56">
            <label htmlFor="corebridge-offline-scope" className="block text-xs font-semibold text-gray-600 mb-1">
              Jobs to export
            </label>
            <select
              id="corebridge-offline-scope"
              value={scope}
              onChange={(event) => { setScope(event.target.value); setResult(null); }}
              disabled={busy}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="all">All non-deleted jobs</option>
              <option value="incomplete">Not completed</option>
              <option value="completed">Completed jobs</option>
            </select>
          </div>
          <Button type="button" onClick={exportJobs} disabled={busy || auditing || verifyingBackup || !sessionToken}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {busy ? "Preparing full register..." : "Download Job Register CSV"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
        )}
        {result && (
          <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            Exported {result.exported} jobs from {result.total} current CCS WorkOrder records.
          </p>
        )}
      </div>
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-blue-700" /> WorkOrder provenance audit
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Checks the complete CCS register, stable Smartsheet row links, creation batches,
              and possible matching customer/job titles. Read-only; no record merging or cleanup.
            </p>
          </div>
          <Button type="button" variant="outline" disabled={auditing || busy || verifyingBackup || !sessionToken} onClick={runAudit}>
            {auditing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
            {auditing ? "Checking every WorkOrder..." : "Run WorkOrder Audit"}
          </Button>
        </div>
        {auditError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{auditError}</p>}
        {auditReport && (
          <div className="space-y-4">
            <p role="status" className="text-xs text-gray-500">Verified read-only snapshot: {new Date(auditReport.audited_at).toLocaleString()}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ["Non-deleted WorkOrders", auditReport.active],
                ["Deleted WorkOrders", auditReport.deleted],
                ["Linked Smartsheet rows", auditReport.linked_sheet_rows],
                ["Duplicate permanent row links", auditReport.duplicate_sheet_link_groups],
                ["Missing or invalid row links", auditReport.missing_sheet_links + auditReport.invalid_sheet_links],
                ["Same customer/title review groups", auditReport.same_customer_title_groups],
              ].map(([label, count]) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xl font-semibold text-gray-900">{Number(count).toLocaleString()}</div>
                  <div className="text-xs text-gray-600">{label}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-800 bg-amber-50 rounded-lg border border-amber-200 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Historical verified reference: 1,100 non-deleted jobs. This is a reference for investigating imports,
              not a target for automatic deletion or a reason to merge matching names.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="font-medium mb-2">Creation dates</div>
                {auditReport.creation_days.map(item => (
                  <div className="flex justify-between gap-2" key={item.name}>
                    <span>{item.name}</span><span className="font-semibold">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="font-medium mb-2">Permanent Smartsheet sheet links</div>
                {auditReport.sheet_groups.length ? auditReport.sheet_groups.map(item => (
                  <div className="flex justify-between gap-2" key={item.name}>
                    <span className="break-all">{item.name}</span><span className="font-semibold">{item.count.toLocaleString()}</span>
                  </div>
                )) : <p className="text-gray-500">No valid external sheet links found.</p>}
              </div>
            </div>
            <details open className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-sm">
              <summary className="font-semibold cursor-pointer text-blue-900">
                Historical backup and import evidence
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    ["WorkOrder backups logged successful", auditReport.history.workorder_backup_logged_success],
                    ["WorkOrder backups skipped", auditReport.history.workorder_backup_skipped],
                    ["WorkOrder backup failures", auditReport.history.workorder_backup_failed],
                    ["Sales pre-sync logs", auditReport.history.sales_presync_log_count],
                    ["Historical ImportJob records", auditReport.history.import_job_count],
                    ["Same-day ImportJobs for first cohort", auditReport.history.import_jobs_on_first_creation_day],
                  ].map(([name, count]) => (
                    <div key={name} className="rounded-md border border-blue-100 bg-white p-2">
                      <div className="text-lg font-semibold">{Number(count).toLocaleString()}</div>
                      <div className="text-xs text-gray-600">{name}</div>
                    </div>
                  ))}
                </div>
                {auditReport.history.last_logged_successful_workorder_backup ? (
                  <div className="rounded-lg border border-blue-100 bg-white p-3">
                    <div className="font-medium">Last logged successful WorkOrder backup</div>
                    <div className="text-xs mt-1">
                      {new Date(auditReport.history.last_logged_successful_workorder_backup.logged_at).toLocaleString()}
                    </div>
                    <div className="text-xs break-all mt-1 text-gray-600">
                      Recorded filename: {auditReport.history.last_logged_successful_workorder_backup.filename || "not recorded"}
                    </div>
                  </div>
                ) : (
                  <div className="text-amber-800">No successful WorkOrder backup log was found.</div>
                )}
                {auditReport.history.first_sales_presync_log && (
                  <div className="text-xs text-gray-700">
                    First logged Sales pre-sync check: {new Date(auditReport.history.first_sales_presync_log).toLocaleString()}.
                    These records document checks, not verified, recoverable Sales backup files.
                  </div>
                )}
                {auditReport.history.workorders_created_after_last_logged_backup_day != null && (
                  <p className="text-xs text-gray-700">
                    {Number(auditReport.history.workorders_created_after_last_logged_backup_day).toLocaleString()}
                    {" "}currently retained WorkOrders were created on dates after the last logged successful
                    WorkOrder backup day. A historic backup comparison is needed to establish any overlap.
                  </p>
                )}
                <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-3">
                  <div className="font-medium">Verify the September 22 WorkOrder backup file</div>
                  <p className="text-xs text-gray-600">
                    Read the exact logged Excel file through the existing app Google Drive connection,
                    verify its original WorkOrder ID column, and compare it to every current WorkOrder.
                    The file remains in Drive; CCS records are never modified.
                  </p>
                  <Button type="button" variant="outline" onClick={verifyBackup}
                    disabled={!sessionToken || busy || auditing || verifyingBackup}>
                    {verifyingBackup ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
                    {verifyingBackup ? "Verifying historical file..." : "Verify September 22 Backup"}
                  </Button>
                  {backupError && (
                    <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{backupError}</p>
                  )}
                  {backupComparison && (
                    <div role="status" className="space-y-3">
                      <p className="font-medium text-emerald-800">
                        Exact historical file verified: {backupComparison.backup_filename}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {[
                          ["IDs in verified backup", backupComparison.backup_record_count],
                          ["Current WorkOrder IDs", backupComparison.current_record_count],
                          ["Original IDs still non-deleted", backupComparison.backup_ids_found_non_deleted],
                          ["Original IDs currently deleted", backupComparison.backup_ids_found_deleted],
                          ["Original IDs absent", backupComparison.backup_ids_absent_from_current],
                          ["Current non-deleted IDs not in backup", backupComparison.current_non_deleted_ids_absent_from_backup],
                        ].map(([name, count]) => (
                          <div key={name} className="rounded-md border bg-white p-2">
                            <div className="font-semibold text-lg">{Number(count).toLocaleString()}</div>
                            <div className="text-xs text-gray-600">{name}</div>
                          </div>
                        ))}
                      </div>
                      {backupComparison.backup_ids_absent_from_current > 0 && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          Some historical IDs are not in the current database. This does not authorize
                          restoring the old backup or deleting current Smartsheet-linked records.
                        </p>
                      )}
                      <details className="text-xs border rounded-md p-2">
                        <summary className="cursor-pointer font-medium">Sample record IDs for manual reconciliation</summary>
                        <div className="space-y-2 mt-2">
                          {[
                            ["Original IDs absent", backupComparison.missing_backup_ids],
                            ["Original IDs still present", backupComparison.matched_backup_ids],
                            ["Current IDs absent from backup", backupComparison.new_current_ids],
                          ].map(([label, ids]) => (
                            <div key={label}><div className="font-medium">{label}</div>
                              <p className="break-all text-gray-600">{ids?.length ? ids.join(", ") : "None in sample"}</p>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  BackupLog entries alone do not prove file availability or completeness.
                  Only a successful file verification can establish the actual historical ID overlap.
                  No restore, deletion, or email import is performed.
                </p>
              </div>
            </details>
            {auditReport.duplicate_sheet_link_groups > 0 && (
              <p role="alert" className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                Multiple WorkOrders share permanent Smartsheet row links. Review synchronization before further imports.
              </p>
            )}
            {auditReport.review_only_name_samples.length > 0 && (
              <details className="rounded-lg border border-gray-200 p-3 text-sm">
                <summary className="font-medium cursor-pointer">Review sample: shared customer and job title (not confirmed duplicates)</summary>
                <div className="mt-3 space-y-3">
                  {auditReport.review_only_name_samples.map((group, index) => (
                    <div key={index} className="border-t border-gray-100 pt-2">
                      <div className="font-medium">{group.client} â€” {group.title} ({group.count} records)</div>
                      <div className="mt-1 space-y-1 text-xs text-gray-600">
                        {group.jobs.map(job => <div key={job.id} className="break-all">CCS {job.id} Â· Sheet row {job.sheet_row_id || "not linked"}</div>)}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <p className="text-xs text-gray-500">Every matching name/title needs human review; permanent row identities take precedence. Only the first 12 review groups appear here.</p>
          </div>
        )}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white/60 p-4 text-sm text-gray-600 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-gray-800">
          <ShieldCheck className="w-4 h-4 text-green-700" /> Existing migration paths
        </div>
        <p>
          For an exported WIP workbook, use Backend Functions â†’ WIP Import. It already matches
          existing jobs by order number and updates descriptions and install dates.
          Sales Pipeline and Order Form have their own existing spreadsheet exports and imports.
          No automatic CoreBridge synchronization is enabled.
        </p>
        <p className="text-xs">
          Historical CoreBridge import records and audit logs remain preserved.
          This CSV is a snapshot of CCS records, not a fresh export from CoreBridge.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-800">Import run log</h3>
          <Button type="button" variant="outline" size="sm" disabled={logLoading} onClick={loadLog}>
            {logLoading ? "Loading…" : logRows === null ? "Load log" : "Refresh"}
          </Button>
        </div>
        {logRows !== null && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input type="text" value={logSearch} onChange={(e) => setLogSearch(e.target.value)}
                placeholder="Search errors, status, dates…" aria-label="Search import log"
                className="h-9 flex-1 min-w-40 rounded-md border border-input bg-transparent px-3 text-xs" />
              <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)}
                className="h-9 rounded-md border bg-transparent px-2 text-xs" aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="partial">Partial</option>
                <option value="no_emails">No emails</option>
              </select>
            </div>
            {visibleLogs.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-500">No log entries match.</p>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {visibleLogs.map((row) => (
                  <div key={row.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-800">{row.run_at || "—"}</span>
                      <span className={`rounded-full px-2 py-0.5 ${row.status === "success" ? "bg-green-100 text-green-700" : row.status === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                        {row.status || "unknown"}
                      </span>
                      <span className="text-gray-500">{row.trigger || ""}</span>
                      <span className="text-gray-400">{row.emails_found ?? "—"} found · {row.processed ?? "—"} processed</span>
                    </div>
                    {row.error_message && <p className="mt-1 text-red-700">{row.error_message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {logError && <p className="mt-2 text-xs text-red-600">{logError}</p>}
      </div>
    </div>
  );
}