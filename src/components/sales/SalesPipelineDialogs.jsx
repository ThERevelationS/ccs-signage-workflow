import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CellContextMenu } from "@/components/shared/CellContextMenu";
import { ColumnHeaderContextMenu } from "@/components/shared/ColumnHeaderContextMenu";
import DeadlineGradientDialog from "@/components/sales/DeadlineGradientDialog";

export default function SalesPipelineDialogs({
  bulkDeleteConfirm, setBulkDeleteConfirm, selectedRows, confirmBulkDelete,
  clearDateConfirm, setClearDateConfirm, updateWorkOrder,
  contextMenu, setContextMenu, clearCell, isRegistered,
  headerContextMenu, setHeaderContextMenu,
  handleColumnSort, handleCustomSort, clearSort, sortConfig, workOrders, currentUser,
  handleHeaderContextMenuAction,
  showGradientDialog, setShowGradientDialog, deadlineGradientSettings, saveGradientSettings,
  deleteConfirm, setDeleteConfirm, confirmDelete
}) {
  return (
    <>
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent className="clay-card border-none max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedRows.size} rows?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedRows.size} selected work order{selectedRows.size > 1 ? 's' : ''}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-red-600 text-white">Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!clearDateConfirm} onOpenChange={() => setClearDateConfirm(null)}>
        <AlertDialogContent className="clay-card border-none max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Date?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear this date?
              <br /><br />
              <span className="font-medium text-orange-600">Note:</span> Email automations may be resent if this field is filled out again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (clearDateConfirm) updateWorkOrder(clearDateConfirm.woId, clearDateConfirm.field, "");
                setClearDateConfirm(null);
              }}
              className="bg-red-600 text-white"
            >Clear Date</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {contextMenu && (
        <CellContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          entityType="WorkOrder"
          entityId={contextMenu.workOrder.id}
          fieldName={contextMenu.fieldName}
          fieldLabel={contextMenu.fieldLabel}
          currentValue={contextMenu.currentValue}
          onClear={() => clearCell(contextMenu.workOrder.id, contextMenu.fieldName)}
          isRegistered={isRegistered}
        />
      )}

      {headerContextMenu && (
        <ColumnHeaderContextMenu
          position={{ x: headerContextMenu.x, y: headerContextMenu.y }}
          onClose={() => setHeaderContextMenu(null)}
          fieldName={headerContextMenu.fieldName}
          fieldLabel={headerContextMenu.fieldLabel}
          onSort={(key, dir) => handleColumnSort(key, dir)}
          onCustomSort={handleCustomSort}
          onClearSort={clearSort}
          currentSortKey={sortConfig.key}
          currentSortDirection={sortConfig.direction}
          allValues={workOrders}
          isAdmin={currentUser?.role === 'admin'}
          onAction={handleHeaderContextMenuAction}
        />
      )}

      <DeadlineGradientDialog
        open={showGradientDialog}
        onClose={() => setShowGradientDialog(false)}
        settings={deadlineGradientSettings}
        onSave={saveGradientSettings}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.title || deleteConfirm?.client_name}"?
              <br /><br />
              <span className="font-medium text-orange-600">Note:</span> This action moves the item to the Project Trash. Only admins can permanently delete or recover items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}