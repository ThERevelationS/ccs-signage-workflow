import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Upload, History, RefreshCw, ShieldAlert } from "lucide-react";
import ImportWizard from "@/components/imports/ImportWizard";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { EmptyState, PageHeader, StatusChip } from "@/components/kit";

const fmtDate = (v) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "—";
};

function ImportHistory({ reloadKey, onNewImport }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadAllEntityRows({
        entity: staffEntities.ImportJob,
        sort: "-created_date",
        label: "Import history",
      });
      setJobs(rows);
    } catch (e) {
      setError(e?.message || "Import history could not be loaded.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  if (loading) return <div className="p-8 text-center text-[12px] text-gray-400">Loading import history…</div>;
  if (error) return <div className="p-8 text-center text-[12px] text-red-600">{error}</div>;

  return (
    <div className="border border-gray-200 rounded-md bg-white overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-[11px] font-semibold text-gray-600">{jobs.length} import run(s)</span>
        <Button variant="outline" className="h-[26px] text-[10px]" onClick={load}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>
      <table className="w-full text-[11px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-1.5 font-semibold text-gray-500">When</th>
            <th className="text-left px-3 py-1.5 font-semibold text-gray-500">Type</th>
            <th className="text-left px-3 py-1.5 font-semibold text-gray-500">File</th>
            <th className="text-left px-3 py-1.5 font-semibold text-gray-500">Status</th>
            <th className="text-left px-3 py-1.5 font-semibold text-gray-500">Result</th>
            <th className="text-left px-3 py-1.5 font-semibold text-gray-500">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {jobs.map((j) => (
            <tr key={j.id}>
              <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{fmtDate(j.created_date || j.started_at)}</td>
              <td className="px-3 py-1.5 text-gray-800 font-medium">{j.import_type || "—"}</td>
              <td className="px-3 py-1.5 text-gray-600 max-w-[200px] truncate">{j.file_name || "—"}</td>
              <td className="px-3 py-1.5">
                <StatusChip status={j.status} size="sm" />
              </td>
              <td className="px-3 py-1.5 text-gray-600 max-w-[320px]">
                <span className="block truncate" title={j.result_message || j.error_message || ""}>
                  {j.result_message || j.error_message || `of ${j.total_items ?? "—"} rows`}
                </span>
              </td>
              <td className="px-3 py-1.5 text-gray-500">{j.user_email || "—"}</td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr><td colSpan={6} className="p-0">
              <EmptyState
                compact
                title="No imports recorded yet."
                message="Finished imports land here with row counts, errors, and who ran them."
                actionLabel={onNewImport ? "New Import" : undefined}
                onAction={onNewImport}
              />
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Imports() {
  const { currentUser } = useAuth();
  const [tab, setTab] = useState("new");
  const [reloadKey, setReloadKey] = useState(0);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <EmptyState
        icon={ShieldAlert}
        className="mx-auto max-w-3xl px-4 py-10"
        title="Administrators only"
        message="Bulk imports change shared catalog and customer data. Ask an administrator to run them."
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <PageHeader
        breadcrumbs={[{ label: "Queues", to: "/EstimatorQueues" }, { label: "Imports" }]}
        icon={Upload}
        title="Imports"
        subtitle="CoreBridge bulk imports — customers, contacts, addresses, parts, and vendor associations."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-[32px]">
          <TabsTrigger value="new" className="text-[11px]"><Upload className="w-3.5 h-3.5 mr-1" /> New Import</TabsTrigger>
          <TabsTrigger value="history" className="text-[11px]"><History className="w-3.5 h-3.5 mr-1" /> Import History</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="mt-4">
          <ImportWizard onImportFinished={() => setReloadKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <ImportHistory reloadKey={reloadKey} onNewImport={() => setTab("new")} />
        </TabsContent>
      </Tabs>
    </div>
  );
}