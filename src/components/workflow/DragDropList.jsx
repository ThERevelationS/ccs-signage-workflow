import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import WorkOrderCard from "./WorkOrderCard";
import { GripVertical } from "lucide-react";

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
            className="grid grid-cols-1 xl:grid-cols-2 gap-4"
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
                    style={{
                      ...provided.draggableProps.style,
                      opacity: snapshot.isDragging ? 0.5 : 1
                    }}
                    className="relative"
                  >
                    {!workOrder.is_rider && (
                      <div
                        {...provided.dragHandleProps}
                        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 cursor-grab active:cursor-grabbing clay-button p-2 rounded-lg"
                        style={{
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,240,240,0.9) 100%)',
                          touchAction: 'none'
                        }}
                      >
                        <GripVertical className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div style={{ paddingLeft: workOrder.is_rider ? '0' : '60px' }}>
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