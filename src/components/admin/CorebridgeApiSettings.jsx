import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ClipboardCheck, Download, FileSpreadsheet, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";

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

  const runAudit = async () => {
    if (!sessionToken || busy || auditing) return;
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
      setAuditReport({ ...data.audit, audited_at: data.audited_at });
    } catch (err) {
      setAuditError(err?.response?.data?.error || err?.message || "The job audit could not be completed.");
    } finally {
      setAuditing(false);
    }
  };

  const exportJobs = async () => {
    if (!sessionToken || busy || auditing) return;
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
            CoreBridge Migration · CCS Native Reports
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
          <Button type="button" onClick={exportJobs} disabled={busy || auditing || !sessionToken}>
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
          <Button type="button" variant="outline" disabled={auditing || busy || !sessionToken} onClick={runAudit}>
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
                ["Active WorkOrders", auditReport.active],
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
                      <div className="font-medium">{group.client} — {group.title} ({group.count} records)</div>
                      <div className="mt-1 space-y-1 text-xs text-gray-600">
                        {group.jobs.map(job => <div key={job.id} className="break-all">CCS {job.id} · Sheet row {job.sheet_row_id || "not linked"}</div>)}
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
          For an exported WIP workbook, use Backend Functions → WIP Import. It already matches
          existing jobs by order number and updates descriptions and install dates.
          Sales Pipeline and Order Form have their own existing spreadsheet exports and imports.
          No automatic CoreBridge synchronization is enabled.
        </p>
        <p className="text-xs">
          Historical CoreBridge import records and audit logs remain preserved.
          This CSV is a snapshot of CCS records, not a fresh export from CoreBridge.
        </p>
      </div>
    </div>
  );
}
