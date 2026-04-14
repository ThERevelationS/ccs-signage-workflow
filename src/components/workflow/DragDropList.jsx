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
  showMoveOptions = true
}) {
  const handleDragEnd = (result) => {
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

  // Split work orders into two columns for display, but maintain single index order
  const leftColumn = enrichedWorkOrders.filter((_, i) => i % 2 === 0);
  const rightColumn = enrichedWorkOrders.filter((_, i) => i % 2 === 1);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left Column */}
        <Droppable droppableId="left-column">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="flex flex-col gap-4"
            >
              {leftColumn.map((workOrder) => {
                const originalIndex = enrichedWorkOrders.findIndex(wo => wo.id === workOrder.id);
                return (
                  <Draggable 
                    key={workOrder.id} 
                    draggableId={workOrder.id} 
                    index={originalIndex}
                    
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
                          priorityNumber={originalIndex + 1}
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

        {/* Right Column */}
        <Droppable droppableId="right-column">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="flex flex-col gap-4"
            >
              {rightColumn.map((workOrder) => {
                const originalIndex = enrichedWorkOrders.findIndex(wo => wo.id === workOrder.id);
                return (
                  <Draggable 
                    key={workOrder.id} 
                    draggableId={workOrder.id} 
                    index={originalIndex}
                    
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
                          priorityNumber={originalIndex + 1}
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
      </div>
    </DragDropContext>
  );
}