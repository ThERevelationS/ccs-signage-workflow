import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical } from "lucide-react";
import InstallLineItem from "./InstallLineItem";

export default function ItemsList({ items, inventory, settings, compact, onUpdate, onRemove, onDuplicate, onReorder }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    onReorder(result.source.index, result.destination.index);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="install-items">
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
            {items.map((item, idx) => (
              <Draggable key={`item-${idx}`} draggableId={`item-${idx}`} index={idx}>
                {(prov, snapshot) => (
                  <div
                    ref={prov.innerRef}
                    {...prov.draggableProps}
                    className={`flex items-stretch gap-1 ${snapshot.isDragging ? "opacity-80 shadow-2xl" : ""}`}
                  >
                    <div
                      {...prov.dragHandleProps}
                      className="flex items-center px-1 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                      title="Drag to reorder"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <InstallLineItem
                        item={item}
                        index={idx}
                        inventory={inventory}
                        settings={settings}
                        compact={compact}
                        onUpdate={(updated) => onUpdate(idx, updated)}
                        onRemove={() => onRemove(idx)}
                        onDuplicate={() => onDuplicate(idx)}
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