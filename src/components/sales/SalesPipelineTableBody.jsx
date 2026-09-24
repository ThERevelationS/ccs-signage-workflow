import React, { memo } from "react";
import SalesPipelineRow from "@/components/sales/SalesPipelineRow";

const SalesPipelineTableBody = memo(function SalesPipelineTableBody({
  virtualItems, filteredWorkOrders, isColumnVisible, focusedRowId, setFocusedRowId, setFocusedRowIndex,
  getTaskDescStyle, getDeadlineCellColor, calculateDays, openDatePopover, setOpenDatePopover,
  setClearDateConfirm, updateWorkOrder, isRegistered, isAdmin, selectedRows, toggleRowSelection,
  handleContextMenu, setSelectedWorkOrder, onRequestStatusChange, onCompleteFollowUp, openCorbridgeDialog, handleDuplicateClient, deleteWorkOrder,
  leadSources, users, taskDescriptions, projectTypes, rowVirtualizer,
}) {
  return (
    <tbody>
      <tr style={{ height: `${virtualItems[0]?.start || 0}px` }}><td colSpan={100} /></tr>
      {virtualItems.map((virtualRow) => {
        const index = virtualRow.index;
        const wo = filteredWorkOrders[index];
        if (!wo) return null;
        return (
          <SalesPipelineRow
            key={wo.id}
            wo={wo}
            index={index}
            isColumnVisible={isColumnVisible}
            focusedRowId={focusedRowId}
            setFocusedRowId={setFocusedRowId}
            setFocusedRowIndex={setFocusedRowIndex}
            getTaskDescStyle={getTaskDescStyle}
            getDeadlineCellColor={getDeadlineCellColor}
            calculateDays={calculateDays}
            openDatePopover={openDatePopover}
            setOpenDatePopover={setOpenDatePopover}
            setClearDateConfirm={setClearDateConfirm}
            updateWorkOrder={updateWorkOrder}
            isRegistered={isRegistered}
            isAdmin={isAdmin}
            selectedRows={selectedRows}
            toggleRowSelection={toggleRowSelection}
            handleContextMenu={handleContextMenu}
            setSelectedWorkOrder={setSelectedWorkOrder}
            onRequestStatusChange={onRequestStatusChange}
            onCompleteFollowUp={onCompleteFollowUp}
            openCorbridgeDialog={openCorbridgeDialog}
            handleDuplicateClient={handleDuplicateClient}
            deleteWorkOrder={deleteWorkOrder}
            leadSources={leadSources}
            users={users}
            taskDescriptions={taskDescriptions}
            projectTypes={projectTypes}
          />
        );
      })}
      <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end || 0)}px` }}><td colSpan={100} /></tr>
    </tbody>
  );
});

export default SalesPipelineTableBody;