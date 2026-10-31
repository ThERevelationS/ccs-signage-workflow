import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, History, RefreshCw, ShieldAlert } from "lucide-react";
import ImportWizard from "@/components/imports/ImportWizard";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const STATUS_STYLES = {
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  running: "bg-blue-100 text-blue-800 border-blue-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

const fmtDate = (v) => {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? new Date(t).toLocaleString() : "—";
};

function ImportHistory({ reloadKey }) {
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
                <Badge className={STATUS_STYLES[j.status] || "bg-gray-100 text-gray-700 border-gray-200"}>
                  {j.status || "—"}
                </Badge>
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
            <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No imports recorded yet.</td></tr>
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
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-2" />
        <div className="text-[14px] font-bold text-gray-900">Administrators only</div>
        <p className="text-[11px] text-gray-500 mt-1">
          Bulk imports change shared catalog and customer data. Ask an administrator to run them.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded bg-indigo-50 text-indigo-700 flex items-center justify-center">
          <Upload className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-gray-900">Imports</h1>
          <p className="text-[10px] text-gray-500">
            CoreBridge bulk imports — customers, contacts, addresses, parts, and vendor associations.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-[32px]">
          <TabsTrigger value="new" className="text-[11px]"><Upload className="w-3.5 h-3.5 mr-1" /> New Import</TabsTrigger>
          <TabsTrigger value="history" className="text-[11px]"><History className="w-3.5 h-3.5 mr-1" /> Import History</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="mt-4">
          <ImportWizard onImportFinished={() => setReloadKey((k) => k + 1)} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <ImportHistory reloadKey={reloadKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
