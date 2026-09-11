import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import WorkOrderCard from "./WorkOrderCard";

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
    if (reorderDisabled) return;
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    
    const items = Array.from(workOrders);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    onReorder(items);
  };

  // Pre-compute riders and parents from the already-loaded list to avoid per-card API calls
  const enrichedWorkOrders = React.useMemo(() => {
    return workOrders.map(wo => ({
      ...wo,
      _riders: workOrders.filter(r => r.parent_work_order_id === wo.id && r.is_rider),
      _parent: wo.is_rider ? (workOrders.find(p => p.id === wo.parent_work_order_id) || null) : null,
    }));
  }, [workOrders]);

  if (!workOrders || workOrders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No work orders in this stage</p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="work-order-priority-list">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="grid grid-cols-1 xl:grid-cols-2 gap-4"
          >
            {enrichedWorkOrders.map((workOrder, index) => (
              <Draggable
                key={workOrder.id}
                draggableId={workOrder.id}
                index={index}
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
                      priorityNumber={index + 1}
                      dragHandleProps={provided.dragHandleProps}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}