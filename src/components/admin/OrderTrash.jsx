import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const Order = base44.entities.Order;

export default function OrderTrash() {
  const [deletedOrders, setDeletedOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recoverConfirm, setRecoverConfirm] = useState(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(null);

  useEffect(() => {
    loadDeletedOrders();
  }, []);

  const loadDeletedOrders = async () => {
    setIsLoading(true);
    try {
      const deleted = await Order.filter({ deleted: true });
      setDeletedOrders(deleted.sort((a, b) => (b.deleted_at || "").localeCompare(a.deleted_at || "")));
    } catch (error) {
      console.error("Error loading deleted orders:", error);
    }
    setIsLoading(false);
  };

  const handleRecover = async () => {
    await Order.update(recoverConfirm.id, {
      deleted: false,
      deleted_at: null,
      deleted_by: null
    });
    setDeletedOrders(deletedOrders.filter(o => o.id !== recoverConfirm.id));
    setRecoverConfirm(null);
  };

  const handlePermanentDelete = async () => {
    await Order.delete(permanentDeleteConfirm.id);
    setDeletedOrders(deletedOrders.filter(o => o.id !== permanentDeleteConfirm.id));
    setPermanentDeleteConfirm(null);
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
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-orange-600" />
        <p className="text-sm text-gray-600">
          {deletedOrders.length} deleted order{deletedOrders.length !== 1 ? 's' : ''} in trash
        </p>
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
    </div>
  );
}