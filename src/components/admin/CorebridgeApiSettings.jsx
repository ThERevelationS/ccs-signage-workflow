import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";

// The legacy component name is retained because AdminSettings already mounts it.
// This page does not call CoreBridge, Gmail, or any historical importer.
export default function CorebridgeApiSettings({ sessionToken }) {
  const [scope, setScope] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const exportJobs = async () => {
    if (!sessionToken || busy) return;
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
          <Button type="button" onClick={exportJobs} disabled={busy || !sessionToken}>
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
