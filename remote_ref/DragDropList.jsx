import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import WorkOrderCard from "./WorkOrderCard";
import { reorderTwoColumnWorkOrders, splitTwoColumnWorkOrders } from "./twoColumnWorkOrderReorder";

export default function DragDropList({ 
  workOrders, 
  onReorder, 
  onEdit, 
  onMove, 
  onSplit, 
  onComplete,
  onRestore,
  onUpdate,
  onDelete,
  showMoveOptions = true,
  reorderDisabled = false
}) {
  const handleDragEnd = (result) => {
    if (reorderDisabled || !result.destination) return;
    try {
      const reordered = reorderTwoColumnWorkOrders(workOrders, result);
      if (reordered === workOrders) return;
      onReorder(reordered);
    } catch (error) {
      console.error("Work Order drag reorder was blocked:", error);
      onUpdate?.();
    }
  };

  // Pre-compute riders and parents from the already-loaded list to avoid per-card API calls
  const enrichedWorkOrders = React.useMemo(() => {
    // Index first — a per-card filter+find is O(n^2) and stalls large stages.
    const byId = new Map();
    const ridersByParent = new Map();
    for (const wo of workOrders) {
      if (wo?.id) byId.set(wo.id, wo);
      if (wo?.is_rider && wo?.parent_work_order_id) {
        const list = ridersByParent.get(wo.parent_work_order_id) || [];
        list.push(wo);
        ridersByParent.set(wo.parent_work_order_id, list);
      }
    }
    return workOrders.map(wo => ({
      ...wo,
      _riders: ridersByParent.get(wo.id) || [],
      _parent: wo.is_rider ? (byId.get(wo.parent_work_order_id) || null) : null,
    }));
  }, [workOrders]);

  // Mount the first cards immediately and append the rest in idle batches.
  // Appending at the end never shifts mounted indexes, so drag-and-drop stays
  // correct while a large stage fills in after first paint.
  const [visibleCount, setVisibleCount] = React.useState(40);
  React.useEffect(() => {
    if (visibleCount >= enrichedWorkOrders.length) return;
    const schedule = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 50));
    const cancel = window.cancelIdleCallback || window.clearTimeout;
    const id = schedule(() => setVisibleCount((c) => Math.min(c + 60, enrichedWorkOrders.length)));
    return () => cancel(id);
  }, [visibleCount, enrichedWorkOrders.length]);

  if (!workOrders || workOrders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No work orders in this stage</p>
      </div>
    );
  }

  const { left: leftColumn, right: rightColumn } = splitTwoColumnWorkOrders(enrichedWorkOrders);
  // Logical positions interleave across the two columns, so a visible count of
  // N shows ceil(N/2) left cards and floor(N/2) right cards.
  const leftVisible = Math.ceil(visibleCount / 2);
  const rightVisible = Math.floor(visibleCount / 2);
  const renderColumn = (columnItems, droppableId, side, columnVisible) => (
    <Droppable droppableId={droppableId}>
      {(provided) => (
        <div
          {...provided.droppableProps}
          ref={provided.innerRef}
          className="flex flex-col gap-4"
        >
          {columnItems.slice(0, columnVisible).map((workOrder, columnIndex) => {
            const logicalIndex = columnIndex * 2 + (side === "right" ? 1 : 0);
            return (
              <Draggable
                key={workOrder.id}
                draggableId={workOrder.id}
                index={columnIndex}
                isDragDisabled={reorderDisabled}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    style={provided.draggableProps.style}
                    className={`${snapshot.isDragging ? 'z-50 opacity-90' : ''}`}
                  >
                    <WorkOrderCard
                      workOrder={workOrder}
                      onEdit={onEdit}
                      onMove={onMove}
                      onSplit={onSplit}
                      onComplete={onComplete}
                      onRestore={onRestore}
                      onUpdate={onUpdate}
                      onDelete={onDelete}
                      showMoveOptions={showMoveOptions}
                      priorityNumber={logicalIndex + 1}
                      dragHandleProps={provided.dragHandleProps}
                    />
                  </div>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderColumn(leftColumn, "work-order-left", "left", leftVisible)}
        {renderColumn(rightColumn, "work-order-right", "right", rightVisible)}
      </div>
    </DragDropContext>
  );
}