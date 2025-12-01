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

  if (!workOrders || workOrders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No work orders in this stage</p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="work-orders-list">
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="flex flex-wrap gap-4"
          >
            {workOrders.map((workOrder, index) => (
              <Draggable 
                key={workOrder.id} 
                draggableId={workOrder.id} 
                index={index}
                isDragDisabled={workOrder.is_rider}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={provided.draggableProps.style}
                    className={`w-full xl:w-[calc(50%-0.5rem)] ${snapshot.isDragging ? 'opacity-80 z-50' : ''} ${!workOrder.is_rider ? 'cursor-grab active:cursor-grabbing' : ''}`}
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