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
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  assertOrderSystemResetCatalogStable,
  assertOrderSystemResetComplete,
  deleteVerifiedOrderSnapshots,
  permanentlyDeleteTrashOrderFromLoadedSnapshot,
  restoreOrderFromLoadedTrashSnapshot,
} from "@/components/orders/orderPersistence";

const Order = base44.entities.Order;
const SYSTEM_RESET_PASSWORD = "Heinlein56!!";

export default function OrderTrash() {
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [recoverConfirm, setRecoverConfirm] = useState(null);
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(null);
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [bulkDeletePassword, setBulkDeletePassword] = useState("");
  const [bulkDeleteError, setBulkDeleteError] = useState("");
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({ active: false, current: 0, total: 0 });

  useEffect(() => {
    loadDeletedOrders();
  }, []);

  const loadDeletedOrders = async () => {
    setIsLoading(true);
    setReadError("");
    try {
      const deleted = await loadAllEntityRows({
        entity: Order,
        query: { deleted: true },
        sort: "created_date",
        label: "Order trash",
      });
      setDeletedOrders(deleted.sort((a, b) => (b.deleted_at || "").localeCompare(a.deleted_at || "")));
    } catch (error) {
      console.error("Error loading deleted orders:", error);
      setDeletedOrders([]);
      setReadError(error?.message || "Order trash could not be verified completely.");
    }
    setIsLoading(false);
  };

  const handleRecover = async () => {
    const target = recoverConfirm;
    if (!target || recoverBusy) return;
    setRecoverBusy(true);
    setActionError("");
    try {
      await restoreOrderFromLoadedTrashSnapshot({
        entity: Order,
        order: target,
        label: "Order Trash recovery",
      });
      setDeletedOrders((current) => current.filter(o => o.id !== target.id));
      setRecoverConfirm(null);
    } catch (error) {
      console.error("Could not recover Order safely:", error);
      setActionError(error?.message || "The deleted Order changed after trash was loaded. Reload Order Trash before recovering it.");
      setRecoverConfirm(null);
    } finally {
      setRecoverBusy(false);
    }
  };

  const handlePermanentDelete = async () => {
    const target = permanentDeleteConfirm;
    if (!target || permanentDeleteBusy) return;
    setPermanentDeleteBusy(true);
    setActionError("");
    try {
      await permanentlyDeleteTrashOrderFromLoadedSnapshot({
        entity: Order,
        order: target,
        label: "Order Trash permanent delete",
      });
      setDeletedOrders((current) => current.filter(o => o.id !== target.id));
      setPermanentDeleteConfirm(null);
    } catch (error) {
      console.error("Could not permanently delete Order safely:", error);
      setActionError(error?.message || "Permanent deletion was blocked because the Order could not be verified safely. Reload Order Trash before retrying.");
      setPermanentDeleteConfirm(null);
    } finally {
      setPermanentDeleteBusy(false);
    }
  };

  const handleBulkDeleteAllOrders = async () => {
    if (bulkDeleteBusy) return;
    if (bulkDeletePassword !== SYSTEM_RESET_PASSWORD) {
      setBulkDeleteError("Incorrect password");
      return;
    }

    setBulkDeleteError("");
    setActionError("");
    setBulkDeleteBusy(true);

    let verifiedOrders;
    try {
      const loadedOrders = await loadAllEntityRows({
        entity: Order,
        sort: "row_number",
        label: "Order System Reset Orders",
      });
      verifiedOrders = await loadAllEntityRows({
        entity: Order,
        sort: "row_number",
        label: "Order System Reset verification Orders",
      });
      assertOrderSystemResetCatalogStable({
        loaded: loadedOrders,
        verified: verifiedOrders,
        label: "Order System Reset preflight",
      });
    } catch (error) {
      console.error("Could not verify all Orders for system reset:", error);
      setBulkDeleteError(error?.message || "All Orders could not be verified. Nothing was permanently deleted.");
      setBulkDeleteBusy(false);
      return;
    }

    setBulkDeleteConfirm(false);
    setBulkDeleteProgress({ active: true, current: 0, total: verifiedOrders.length });

    let completed;
    try {
      completed = await deleteVerifiedOrderSnapshots({
        entity: Order,
        orders: verifiedOrders,
        label: "Order System Reset",
        delayMs: 300,
        onProgress: ({ confirmedAbsent, total }) => {
          setBulkDeleteProgress({ active: true, current: confirmedAbsent, total });
        },
      });
    } catch (error) {
      console.error("Order System Reset stopped before completing:", error);
      const progress = error?.orderResetProgress || {
        confirmedAbsent: 0,
        deletedNow: 0,
        convergedAbsent: 0,
        total: verifiedOrders.length,
      };
      const notConfirmed = progress.total - progress.confirmedAbsent;
      setBulkDeleteProgress({ active: false, current: progress.confirmedAbsent, total: progress.total });
      setBulkDeletePassword("");
      setBulkDeleteBusy(false);
      await loadDeletedOrders();
      setActionError(
        `Order System Reset stopped safely after ${progress.confirmedAbsent} of ${progress.total} Orders were confirmed absent. ` +
        `${progress.deletedNow} were permanently deleted by this run${progress.convergedAbsent ? ` and ${progress.convergedAbsent} were independently confirmed already absent` : ""}. ` +
        `${notConfirmed} Order${notConfirmed === 1 ? " was" : "s were"} not confirmed deleted and will not be skipped automatically. ` +
        `${error?.message || "An Order changed or the deletion outcome could not be verified."}`
      );
      return;
    }

    try {
      const remainingOrders = await loadAllEntityRows({
        entity: Order,
        sort: "row_number",
        label: "Order System Reset final verification",
      });
      assertOrderSystemResetComplete({
        remaining: remainingOrders,
        label: "Order System Reset final verification",
      });
    } catch (error) {
      console.error("Could not verify final Order catalog after system reset:", error);
      setBulkDeleteProgress({ active: false, current: completed.confirmedAbsent, total: completed.total });
      setBulkDeletePassword("");
      setBulkDeleteBusy(false);
      await loadDeletedOrders();
      setActionError(
        `All ${completed.confirmedAbsent} preflight Orders were processed, but the final Order catalog did not verify empty. ` +
        `Do not assume Order System Reset is complete. ${error?.message || "Reload and verify the Order catalog before retrying."}`
      );
      return;
    }

    setBulkDeleteProgress({ active: false, current: completed.confirmedAbsent, total: completed.total });
    setBulkDeletePassword("");
    setBulkDeleteBusy(false);
    await loadDeletedOrders();
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
      <div className="text-center py-8">
        <div className="text-sm font-bold text-red-700">Order trash could not be verified completely.</div>
        <div className="mt-1 text-xs text-red-600">{readError}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadDeletedOrders}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk Delete Progress */}
      {bulkDeleteProgress.active && (
        <div className="clay-card p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-600">Deleting all orders...</span>
            <span className="text-xs text-gray-500">{bulkDeleteProgress.current} / {bulkDeleteProgress.total}</span>
          </div>
          <Progress value={(bulkDeleteProgress.current / bulkDeleteProgress.total) * 100} className="h-2" />
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <p className="text-sm text-gray-600">
            {deletedOrders.length} deleted order{deletedOrders.length !== 1 ? 's' : ''} in trash
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
          Delete ALL Orders (System Reset)
        </Button>
      </div>

      {deletedOrders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Trash2 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No deleted orders</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deletedOrders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-800">{order.customer_name}</span>
                  <Badge variant="outline">{order.request_type}</Badge>
                </div>
                <p className="text-sm text-gray-600 truncate">{order.description}</p>
                <div className="text-xs text-gray-500 mt-1">
                  Deleted {order.deleted_at ? format(new Date(order.deleted_at), "MMM d, yyyy h:mm a") : "unknown"}
                  {order.deleted_by && ` by ${order.deleted_by}`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRecoverConfirm(order)}
                  className="text-green-600 hover:text-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Recover
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPermanentDeleteConfirm(order)}
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
            <AlertDialogTitle>Recover Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to recover this order for "{recoverConfirm?.customer_name}"? It will be restored to the system.
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
              Are you sure you want to permanently delete this order for "{permanentDeleteConfirm?.customer_name}"?
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

      {/* Bulk Delete All Orders Confirmation */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={(open) => { setBulkDeleteConfirm(open); setBulkDeletePassword(""); setBulkDeleteError(""); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <Lock className="w-5 h-5" />
              System Reset - Delete ALL Orders
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>This will <span className="font-bold text-red-600">permanently delete ALL orders</span> from the system, not just items in trash.</p>
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
            <Button onClick={handleBulkDeleteAllOrders} className="bg-red-600 text-white hover:bg-red-700">
              Delete All Orders
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}