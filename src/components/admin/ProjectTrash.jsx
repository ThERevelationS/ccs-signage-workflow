import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Trash2, RotateCcw, Loader2, AlertTriangle, Lock } from "lucide-react";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { restoreWorkOrderFromLoadedTrashSnapshot } from "@/components/workflow/workOrderPersistence";
import {
  assertSystemResetCatalogStable,
  permanentlyDeleteTrashWorkOrderFromLoadedSnapshot,
  permanentlyDeleteWorkOrderFromLoadedSnapshot,
} from "@/components/admin/projectTrashPersistence";

const WorkOrder = base44.entities.WorkOrder;
const SYSTEM_RESET_CONFIRMATION = "DELETE ALL CLIENTS";

async function requireCurrentAdmin(label) {
  const me = await base44.auth.me().catch(() => null);
  if (me?.role !== "admin") {
    throw new Error(`${label} requires a currently authenticated administrator. Reload Admin Settings and sign in again before retrying.`);
  }
  return me;
}

export default function ProjectTrash() {
  const [deletedProjects, setDeletedProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [recoverConfirm, setRecoverConfirm] = useState(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(null);
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkDeletePhrase, setBulkDeletePhrase] = useState("");
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ active: false, current: 0, total: 0 });

  useEffect(() => {
    loadDeletedProjects();
  }, []);

  const loadDeletedProjects = async () => {
    setIsLoading(true);
    setReadError("");
    setActionError("");
    try {
      const deleted = await loadAllEntityRows({
        entity: WorkOrder,
        query: { deleted: true },
        sort: "deleted_at",
        label: "Deleted Work Orders",
      });
      setDeletedProjects(deleted.sort((a, b) => (b.deleted_at || "").localeCompare(a.deleted_at || "")));
    } catch (error) {
      console.error("Error loading deleted projects:", error);
      setDeletedProjects([]);
      setReadError(error?.message || "Deleted Work Orders could not be verified completely.");
    }
    setIsLoading(false);
  };

  const handleRecover = async () => {
    if (!recoverConfirm) return;
    try {
      await restoreWorkOrderFromLoadedTrashSnapshot({
        workOrder: recoverConfirm,
        label: "Project Trash recovery",
      });
      setDeletedProjects((current) => current.filter((project) => project.id !== recoverConfirm.id));
      setRecoverConfirm(null);
    } catch (error) {
      console.error("Could not recover deleted Work Order:", error);
      setActionError(error?.message || "The deleted Work Order changed after trash was loaded. Reload trash before recovering it.");
      setRecoverConfirm(null);
    }
  };

  const handlePermanentDelete = async () => {
    const target = permanentDeleteConfirm;
    if (!target || permanentDeleteBusy) return;

    setActionError("");
    setPermanentDeleteBusy(true);
    try {
      await requireCurrentAdmin("Project Trash permanent delete");
      await permanentlyDeleteTrashWorkOrderFromLoadedSnapshot({
        entity: WorkOrder,
        workOrder: target,
        label: "Project Trash permanent delete",
      });
      setDeletedProjects((current) => current.filter((project) => project.id !== target.id));
      setPermanentDeleteConfirm(null);
    } catch (error) {
      console.error("Could not permanently delete Work Order:", error);
      setActionError(error?.message || "Permanent deletion was blocked because the Work Order could not be verified safely. Reload trash before retrying.");
      setPermanentDeleteConfirm(null);
    } finally {
      setPermanentDeleteBusy(false);
    }
  };

  const handleBulkDeleteAllClients = async () => {
    if (bulkDeleteBusy) return;
    if (bulkDeletePhrase !== SYSTEM_RESET_CONFIRMATION) {
      setBulkDeleteError(`Type ${SYSTEM_RESET_CONFIRMATION} exactly to confirm this irreversible reset.`);
      return;
    }

    setBulkDeleteError("");
    setActionError("");
    setBulkDeleteBusy(true);

    // System Reset is intentionally irreversible. Build and verify the COMPLETE
    // Work Order snapshot twice before deleting anything, then condition every
    // individual hard delete on that row's exact verified updated_date.
    let verifiedWorkOrders;
    try {
      await requireCurrentAdmin("System Reset");
      const loadedWorkOrders = await loadAllEntityRows({ 
        entity: WorkOrder,
        sort: "created_date",
        label: "System Reset Work Orders",
      });
      verifiedWorkOrders = await loadAllEntityRows({
        entity: WorkOrder,
        sort: "created_date",
        label: "System Reset verification Work Orders",
      });
      assertSystemResetCatalogStable({
        loaded: loadedWorkOrders,
        verified: verifiedWorkOrders,
        label: "System Reset preflight",
      });
    } catch (error) {
      console.error("Could not verify all Work Orders for system reset:", error);
      setBulkDeleteError(error?.message || "All Work Orders could not be verified. Nothing was permanently deleted.");
      setBulkDeleteBusy(false);
      return;
    }

    setBulkDeleteConfirm(false);
    setBulkDeleteProgress({ active: true, current: 0, total: verifiedWorkOrders.length });

    let confirmedAbsent = 0;
    let deletedNow = 0;
    let convergedAbsent = 0;
    try {
      for (let i = 0; i < verifiedWorkOrders.length; i += 1) {
        const result = await permanentlyDeleteWorkOrderFromLoadedSnapshot({
          entity: WorkOrder,
          workOrder: verifiedWorkOrders[i],
          label: `System Reset Work Order ${i + 1} of ${verifiedWorkOrders.length}`,
        });
        confirmedAbsent += 1;
        if (result.status === "deleted_now") deletedNow += 1;
        else convergedAbsent += 1;
        setBulkDeleteProgress({ active: true, current: confirmedAbsent, total: verifiedWorkOrders.length });
        if (i < verifiedWorkOrders.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      console.error("System Reset stopped before completing:", error);
      setBulkDeleteProgress({ active: false, current: confirmedAbsent, total: verifiedWorkOrders.length });
      setBulkDeletePhrase("");
      setBulkDeleteBusy(false);
      await loadDeletedProjects();
      const notConfirmed = verifiedWorkOrders.length - confirmedAbsent;
      setActionError(
        `System Reset stopped safely after ${confirmedAbsent} of ${verifiedWorkOrders.length} Work Orders were confirmed absent. ` +
        `${deletedNow} were permanently deleted by this run${convergedAbsent ? ` and ${convergedAbsent} were independently confirmed already absent` : ""}. ` +
        `${notConfirmed} Work Order${notConfirmed === 1 ? " was" : "s were"} not confirmed deleted and will not be skipped automatically. ` +
        `${error?.message || "A Work Order changed or the deletion outcome could not be verified."}`
      );
      return;
    }

    let remainingWorkOrders;
    try {
      remainingWorkOrders = await loadAllEntityRows({
        entity: WorkOrder,
        sort: "created_date",
        label: "System Reset final Work Order verification",
      });
    } catch (error) {
      console.error("Could not verify final Work Order catalog after system reset:", error);
      setBulkDeleteProgress({ active: false, current: confirmedAbsent, total: verifiedWorkOrders.length });
      setBulkDeletePhrase("");
      setBulkDeleteBusy(false);
      await loadDeletedProjects();
      setActionError(
        `All ${confirmedAbsent} preflight Work Orders were processed, but the final Work Order catalog could not be verified. ` +
        `Do not assume System Reset is complete. ${error?.message || "Reload and verify the catalog before retrying."}`
      );
      return;
    }

    setBulkDeleteProgress({ active: false, current: confirmedAbsent, total: verifiedWorkOrders.length });
    setBulkDeletePhrase("");
    setBulkDeleteBusy(false);
    await loadDeletedProjects();
    if (remainingWorkOrders.length > 0) {
      setActionError(
        `System Reset did not delete Work Orders created or changed outside the verified reset snapshot. ` +
        `${remainingWorkOrders.length} Work Order${remainingWorkOrders.length === 1 ? " remains" : "s remain"}. Review the current catalog and run a new confirmed reset only if those records should also be permanently deleted.`
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (readError) {
    return (
      <div className="py-8 text-center">
        <div className="text-sm font-bold text-red-700">Project trash could not be verified.</div>
        <div className="mt-1 text-xs text-red-600">{readError}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadDeletedProjects}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Project Trash action blocked</div>
            <div className="mt-1 text-xs">{actionError}</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadDeletedProjects} className="shrink-0 border-red-300 bg-white text-red-800">
            Reload trash
          </Button>
        </div>
      )}

      {/* Bulk Delete Progress */}
      {bulkDeleteProgress.active && (
        <div className="clay-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-600">Deleting all clients...</span>
            <span className="text-xs text-gray-500">{bulkDeleteProgress.current} / {bulkDeleteProgress.total}</span>
          </div>
          <Progress value={bulkDeleteProgress.total ? (bulkDeleteProgress.current / bulkDeleteProgress.total) * 100 : 0} className="h-2" />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <p className="text-sm text-gray-600">
            {deletedProjects.length} deleted client{deletedProjects.length !== 1 ? 's' : ''} in trash
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setBulkDeleteConfirm(true)}
          disabled={bulkDeleteBusy || bulkDeleteProgress.active}
          className="bg-red-600 hover:bg-red-700"
        >
          <Lock className="w-4 h-4 mr-2" />
          Delete ALL Clients (System Reset)
        </Button>
      </div>

      {deletedProjects.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Trash2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No deleted projects</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deletedProjects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-800">{project.title}</span>
                  <Badge variant="outline">{project.client_name}</Badge>
                </div>
                <div className="text-xs text-gray-500">
                  Deleted {project.deleted_at ? format(new Date(project.deleted_at), "MMM d, yyyy h:mm a") : "unknown"}
                  {project.deleted_by && ` by ${project.deleted_by}`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecoverConfirm(project)}
                  disabled={bulkDeleteBusy || permanentDeleteBusy}
                  className="text-green-600 hover:text-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Recover
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPermanentDeleteConfirm(project)}
                  disabled={bulkDeleteBusy || permanentDeleteBusy}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Permanent
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recover Confirmation */}
      <AlertDialog open={!!recoverConfirm} onOpenChange={() => setRecoverConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Recover Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to recover "{recoverConfirm?.title}"? It will be restored to the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecover} className="bg-green-600 text-white">
              Recover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentDeleteConfirm} onOpenChange={(open) => { if (!open && !permanentDeleteBusy) setPermanentDeleteConfirm(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Permanently Delete?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{permanentDeleteConfirm?.title}"?
              <br /><br />
              <span className="font-bold text-red-600">This action cannot be undone!</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button" disabled={permanentDeleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} disabled={permanentDeleteBusy} className="bg-red-600 text-white">
              {permanentDeleteBusy ? "Verifying..." : "Permanently Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete All Clients Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => {
        if (bulkDeleteBusy) return;
        setBulkDeleteConfirm(open);
        setBulkDeletePhrase("");
        setBulkDeleteError("");
      }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              System Reset - Delete ALL Clients
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>This will <span className="font-bold text-red-600">permanently delete ALL clients/work orders</span> from the system, not just items in trash.</p>
              <p className="text-red-600 font-bold">This action cannot be undone!</p>
              <div className="space-y-2 pt-2">
                <Label htmlFor="bulk-delete-confirmation">Type <span className="font-mono font-bold">{SYSTEM_RESET_CONFIRMATION}</span> to confirm:</Label>
                <Input
                  id="bulk-delete-confirmation"
                  type="text"
                  autoComplete="off"
                  value={bulkDeletePhrase}
                  onChange={(e) => { setBulkDeletePhrase(e.target.value); setBulkDeleteError(""); }}
                  placeholder={SYSTEM_RESET_CONFIRMATION}
                />
                {bulkDeleteError && <p className="text-red-500 text-sm">{bulkDeleteError}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button" disabled={bulkDeleteBusy}>Cancel</AlertDialogCancel>
            <Button onClick={handleBulkDeleteAllClients} disabled={bulkDeleteBusy || bulkDeletePhrase !== SYSTEM_RESET_CONFIRMATION} className="bg-red-600 text-white hover:bg-red-700">
              {bulkDeleteBusy ? "Verifying Complete Catalog..." : "Delete All Clients"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}