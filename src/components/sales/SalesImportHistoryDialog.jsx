import { useEffect, useState } from "react";
import { Clock3, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { staffEntities } from "@/components/staff/staffEntities";

const durationLabel = (ms) => {
  const value = Number(ms || 0);
  if (!value) return "—";
  if (value < 1000) return `${value} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} sec`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const dateLabel = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

export default function SalesImportHistoryDialog({ open, onClose }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await staffEntities.ImportJob.filter(
        { import_type: "sales_pipeline" },
        "-started_at",
        50,
      );
      setJobs(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.error("Could not load Sales import history:", err);
      setError(err?.message || "Import history could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose?.()}>
      <DialogContent className="w-[96vw] max-w-5xl p-0">
        <div className="max-h-[86vh] overflow-y-auto">
          <DialogHeader className="border-b border-gray-100 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Clock3 className="h-5 w-5 text-blue-600" />
                  Sales import history
                </DialogTitle>
                <div className="mt-1 text-xs text-gray-500">Latest 50 tracked Sales Pipeline imports.</div>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-10" onClick={load} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </DialogHeader>

          <div className="p-4 sm:p-5">
            {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            {loading && jobs.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading import history...
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">No tracked Sales imports yet.</div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => {
                  const reviewCount = Number(job.skipped_items || 0);
                  const tone = job.status === "completed"
                    ? "border-emerald-200"
                    : job.status === "failed" || job.status === "cancelled"
                      ? "border-red-200"
                      : "border-blue-200";
                  return (
                    <div key={job.id} className={`rounded-xl border ${tone} bg-white p-3`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-gray-400" />
                            <span className="truncate text-sm font-semibold text-gray-900">{job.file_name || "Sales spreadsheet"}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-600">{job.status || "unknown"}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500">{dateLabel(job.started_at)} · {durationLabel(job.duration_ms)}</div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center text-[11px] sm:min-w-[300px]">
                          <div><div className="font-bold text-green-700">{Number(job.created_items || 0)}</div><div className="text-gray-400">new</div></div>
                          <div><div className="font-bold text-blue-700">{Number(job.updated_items || 0)}</div><div className="text-gray-400">changed</div></div>
                          <div><div className="font-bold text-gray-700">{Number(job.unchanged_items || 0)}</div><div className="text-gray-400">same</div></div>
                          <div><div className={`font-bold ${reviewCount ? "text-amber-700" : "text-gray-700"}`}>{reviewCount}</div><div className="text-gray-400">review</div></div>
                        </div>
                      </div>
                      {(job.result_message || job.error_message) && (
                        <div className={`mt-2 rounded-md px-2.5 py-1.5 text-xs ${job.error_message ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
                          {job.error_message || job.result_message}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
                        <span>Rows {Number(job.total_items || 0).toLocaleString()}</span>
                        {Number(job.parse_ms || 0) > 0 && <span>Parse {durationLabel(job.parse_ms)}</span>}
                        {Number(job.match_ms || 0) > 0 && <span>Match {durationLabel(job.match_ms)}</span>}
                        {Number(job.apply_ms || 0) > 0 && <span>Apply {durationLabel(job.apply_ms)}</span>}
                        {job.conflict_items > 0 && <span>{job.conflict_items} conflict</span>}
                        {job.ambiguous_items > 0 && <span>{job.ambiguous_items} ambiguous</span>}
                        {job.invalid_items > 0 && <span>{job.invalid_items} invalid</span>}
                        {job.file_hash && <span title={job.file_hash}>Fingerprint {String(job.file_hash).slice(0, 10)}…</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
