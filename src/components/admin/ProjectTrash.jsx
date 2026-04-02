import React, { useState, useEffect } from "react";
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

const WorkOrder = base44.entities.WorkOrder;
const SYSTEM_RESET_PASSWORD = "Heinlein56!!";

export default function ProjectTrash() {
  const [deletedProjects, setDeletedProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recoverConfirm, setRecoverConfirm] = useState(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState("");
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ active: false, current: 0, total: 0 });

  useEffect(() => {
    loadDeletedProjects();
  }, []);

  const loadDeletedProjects = async () => {
    setIsLoading(true);
    try {
      const deleted = await WorkOrder.filter({ deleted: true });
      setDeletedProjects(deleted.sort((a, b) => (b.deleted_at || "").localeCompare(a.deleted_at || "")));
    } catch (error) {
      console.error("Error loading deleted projects:", error);
    }
    setIsLoading(false);
  };

  const handleRecover = async () => {
    await WorkOrder.update(recoverConfirm.id, {
      deleted: false,
      deleted_at: null,
      deleted_by: null
    });
    setDeletedProjects(deletedProjects.filter(p => p.id !== recoverConfirm.id));
    setRecoverConfirm(null);
  };

  const handlePermanentDelete = async () => {
    await WorkOrder.delete(permanentDeleteConfirm.id);
    setDeletedProjects(deletedProjects.filter(p => p.id !== permanentDeleteConfirm.id));
    setPermanentDeleteConfirm(null);
  };

  const handleBulkDeleteAllClients = async () => {
    if (bulkDeletePassword !== SYSTEM_RESET_PASSWORD) {
      setBulkDeleteError("Incorrect password");
      return;
    }
    setBulkDeleteError("");
    setBulkDeleteConfirm(false);
    
    // Get ALL work orders (not just deleted ones)
    const allWorkOrders = await WorkOrder.list();
    setBulkDeleteProgress({ active: true, current: 0, total: allWorkOrders.length });
    
    for (let i = 0; i < allWorkOrders.length; i++) {
      try {
        await WorkOrder.delete(allWorkOrders[i].id);
      } catch (e) {
        // skip already-deleted or not-found records
      }
      setBulkDeleteProgress({ active: true, current: i + 1, total: allWorkOrders.length });
      await new Promise(r => setTimeout(r, 300));
    }
    
    setBulkDeleteProgress({ active: false, current: 0, total: 0 });
    setBulkDeletePassword("");
    loadDeletedProjects();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk Delete Progress */}
      {bulkDeleteProgress.active && (
        <div className="clay-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-600">Deleting all clients...</span>
            <span className="text-xs text-gray-500">{bulkDeleteProgress.current} / {bulkDeleteProgress.total}</span>
          </div>
          <Progress value={(bulkDeleteProgress.current / bulkDeleteProgress.total) * 100} className="h-2" />
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
          disabled={bulkDeleteProgress.active}
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
                  className="text-green-600 hover:text-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Recover
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPermanentDeleteConfirm(project)}
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
      <AlertDialog open={!!permanentDeleteConfirm} onOpenChange={() => setPermanentDeleteConfirm(null)}>
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
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-red-600 text-white">
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete All Clients Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => { setBulkDeleteConfirm(open); setBulkDeletePassword(""); setBulkDeleteError(""); }}>
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
                <Label htmlFor="bulk-delete-password">Enter password to confirm:</Label>
                <Input
                  id="bulk-delete-password"
                  type="password"
                  value={bulkDeletePassword}
                  onChange={(e) => { setBulkDeletePassword(e.target.value); setBulkDeleteError(""); }}
                  placeholder="Enter system reset password"
                />
                {bulkDeleteError && <p className="text-red-500 text-sm">{bulkDeleteError}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <Button onClick={handleBulkDeleteAllClients} className="bg-red-600 text-white hover:bg-red-700">
              Delete All Clients
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}