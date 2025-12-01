import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import WorkOrderCard from "./WorkOrderCard";

function SortableItem({ workOrder, index, onEdit, onMove, onSplit, onComplete, onRestore, onUpdate, onDelete, showMoveOptions }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: workOrder.id,
    disabled: workOrder.is_rider 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`${!workOrder.is_rider ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
  );
}

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
  const [activeId, setActiveId] = useState(null);
  
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = workOrders.findIndex(wo => wo.id === active.id);
    const newIndex = workOrders.findIndex(wo => wo.id === over.id);
    
    const newItems = arrayMove(workOrders, oldIndex, newIndex);
    onReorder(newItems);
  };

  if (!workOrders || workOrders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No work orders in this stage</p>
      </div>
    );
  }

  const activeWorkOrder = activeId ? workOrders.find(wo => wo.id === activeId) : null;
  const activeIndex = activeId ? workOrders.findIndex(wo => wo.id === activeId) : -1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={workOrders.map(wo => wo.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {workOrders.map((workOrder, index) => (
            <SortableItem
              key={workOrder.id}
              workOrder={workOrder}
              index={index}
              onEdit={onEdit}
              onMove={onMove}
              onSplit={onSplit}
              onComplete={onComplete}
              onRestore={onRestore}
              onUpdate={onUpdate}
              onDelete={onDelete}
              showMoveOptions={showMoveOptions}
            />
          ))}
        </div>
      </SortableContext>
      
      <DragOverlay>
        {activeWorkOrder ? (
          <div className="opacity-90">
            <WorkOrderCard
              workOrder={activeWorkOrder}
              onEdit={() => {}}
              onMove={() => {}}
              onSplit={() => {}}
              onComplete={() => {}}
              onRestore={() => {}}
              onUpdate={() => {}}
              onDelete={() => {}}
              showMoveOptions={false}
              priorityNumber={activeIndex + 1}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}