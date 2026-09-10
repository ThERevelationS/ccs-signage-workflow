import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Bug,
  Lightbulb,
  TrendingUp,
  CheckCircle2,
  Loader2,
  Trash2,
  RotateCcw,
  ChevronLeft
} from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { deleteFeatureReportSafely, updateFeatureReportFields } from "@/components/reports/featureReportPersistence";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

const FeatureReport = base44.entities.FeatureReport;

const TYPE_CONFIG = {
  bug: { label: "Bug", icon: Bug, color: "bg-red-100 text-red-700" },
  feature: { label: "Feature Request", icon: Lightbulb, color: "bg-blue-100 text-blue-700" },
  improvement: { label: "Improvement", icon: TrendingUp, color: "bg-green-100 text-green-700" }
};

export default function CompletedReports() {
  const { currentUser } = useAuth();
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [mutationError, setMutationError] = useState("");
  const actionRef = useRef(new Set());

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setIsLoading(true);
    setReadError("");
    try {
      const completedReports = await loadAllEntityRows({
        entity: FeatureReport,
        query: { status: "completed" },
        sort: "-completed_date",
        label: "Completed Feature Reports",
      });
      setReports(completedReports);
    } catch (error) {
      console.error("Error loading completed reports:", error);
      setReports([]);
      setReadError(error?.message || "Completed reports could not be verified completely.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReopen = async (report) => {
    const lockKey = `reopen:${report?.id}`;
    if (!report?.id || actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    setMutationError("");
    try {
      await updateFeatureReportFields({
        entity: FeatureReport,
        record: report,
        nextFields: { status: "open", completed_date: null },
        label: `Completed report “${report.title || "Report"}”`,
      });
      await loadReports();
    } catch (error) {
      console.error("Completed report reopen failed:", error);
      setMutationError(error?.message || "The completed report could not be reopened safely.");
      await loadReports();
    } finally {
      actionRef.current.delete(lockKey);
    }
  };

  const handleDelete = async (report) => {
    const lockKey = `delete:${report?.id}`;
    if (!report?.id || actionRef.current.has(lockKey)) return;
    actionRef.current.add(lockKey);
    setMutationError("");
    try {
      await deleteFeatureReportSafely({ entity: FeatureReport, record: report, label: `Completed report “${report.title || "Report"}”` });
      setDeleteConfirm(null);
      await loadReports();
    } catch (error) {
      console.error("Completed report delete failed:", error);
      setMutationError(error?.message || "The completed report could not be deleted safely.");
      setDeleteConfirm(null);
      await loadReports();
    } finally {
      actionRef.current.delete(lockKey);
    }
  };

  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl("FeatureReports")}>
              <Button variant="outline" size="icon">
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="clay-card p-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Completed Reports</h1>
              <p className="text-gray-600 text-sm">Previously resolved bugs and implemented features</p>
            </div>
          </div>
        </div>

        {mutationError && (
          <div className="clay-card mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="font-semibold">Completed report update blocked</div>
            <div className="mt-1 text-xs">{mutationError}</div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setMutationError(""); loadReports(); }}>Reload latest</Button>
          </div>
        )}

        {/* Reports List */}
        {isLoading ? (
          <div className="clay-card p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : readError ? (
          <div className="clay-card p-8 text-center">
            <div className="text-sm font-bold text-red-700">Completed reports could not be verified completely.</div>
            <div className="mt-1 text-xs text-red-600">{readError}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={loadReports}>Retry</Button>
          </div>
        ) : reports.length === 0 ? (
          <div className="clay-card p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No Completed Reports</h3>
            <p className="text-gray-500">Completed items will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => {
              const typeConfig = TYPE_CONFIG[report.type] || TYPE_CONFIG.feature;
              const TypeIcon = typeConfig.icon;

              return (
                <div
                  key={report.id}
                  className="clay-card p-4 border-l-4 border-green-400 opacity-80"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <TypeIcon className="w-4 h-4 text-gray-500" />
                        <h4 className="font-medium text-gray-700 line-through">{report.title}</h4>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                        <Badge className="bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      </div>
                      {report.description && (
                        <p className="text-sm text-gray-500 mt-2">{report.description}</p>
                      )}
                      {report.admin_notes && (
                        <p className="text-sm text-purple-600 mt-2 italic">Note: {report.admin_notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Submitted by {report.submitted_by_name} • Completed {report.completed_date ? new Date(report.completed_date).toLocaleDateString() : "N/A"}
                      </p>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReopen(report)}
                          className="h-8 w-8"
                          title="Reopen"
                        >
                          <RotateCcw className="w-4 h-4 text-blue-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(report)}
                          className="h-8 w-8"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent className="clay-card border-none">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Report?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to permanently delete "{deleteConfirm?.title}"?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleDelete(deleteConfirm)}
                className="bg-red-600 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}