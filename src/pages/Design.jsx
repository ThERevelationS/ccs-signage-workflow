
import { useState, useEffect } from "react";
import { WorkOrder } from "@/entities/WorkOrder";
import { Button } from "@/components/ui/button";
import { Plus, Maximize2, Minimize2 } from "lucide-react";
import DragDropList from "../components/workflow/DragDropList";
import WorkOrderForm from "../components/workflow/WorkOrderForm";

export default function Design() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setIsLoading(true);
    try {
      const allWorkOrders = await WorkOrder.filter(
        { completed: false },
        "priority"
      );
      const filtered = allWorkOrders.filter(
        (wo) => wo.current_stage === 'design' || wo.is_rider && wo.rider_stage === 'design'
      );
      setWorkOrders(filtered);
    } catch (error) {
      console.error("Error loading:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReorder = async (reorderedItems) => {
    setWorkOrders(reorderedItems); // Optimistic update
    try {
      for (let i = 0; i < reorderedItems.length; i++) {
        await WorkOrder.update(reorderedItems[i].id, { priority: i });
      }
    } catch (error) {
      console.error("Error reordering:", error);
      // Revert to original state or re-fetch on error
      loadWorkOrders();
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editingWorkOrder) {
        await WorkOrder.update(editingWorkOrder.id, formData);
      } else {
        const maxPriority = workOrders.length > 0 ?
        Math.max(...workOrders.map((wo) => wo.priority || 0)) :
        -1;
        await WorkOrder.create({ ...formData, priority: maxPriority + 1 });
      }
      setEditingWorkOrder(null);
      setRiderConfig(null);
      setIsFormOpen(false); // Close form after successful save
      loadWorkOrders();
    } catch (error) {
      console.error("Error saving:", error);
    }
  };

  const handleMove = async (workOrder, newStage) => {
    try {
      // Convert notes to array format before updating
      let notes = workOrder.notes || [];
      if (typeof notes === 'string' && notes.trim()) {
        notes = [{
          text: notes,
          timestamp: workOrder.created_date || new Date().toISOString(),
          created_by: workOrder.created_by || "Unknown"
        }];
      }

      await WorkOrder.update(workOrder.id, {
        current_stage: newStage,
        notes: notes
      });
      loadWorkOrders();
    } catch (error) {
      console.error("Error moving:", error);
    }
  };

  const handleEdit = (workOrder) => {
    setEditingWorkOrder(workOrder);
    setRiderConfig(null);
    setIsFormOpen(true);
  };

  const handleSplit = (workOrder) => {
    setRiderConfig({ parentWorkOrder: workOrder, stage: 'design' });
    setEditingWorkOrder(null);
    setIsFormOpen(true);
  };

  const handleComplete = async (workOrder) => {
    try {
      let notes = workOrder.notes || [];
      if (typeof notes === 'string' && notes.trim()) {
        notes = [{
          text: notes,
          timestamp: workOrder.created_date || new Date().toISOString(),
          created_by: workOrder.created_by || "Unknown"
        }];
      }

      await WorkOrder.update(workOrder.id, {
        completed: true,
        current_stage: 'completed',
        notes: notes
      });
      loadWorkOrders();
    } catch (error) {
      console.error("Error completing work order:", error);
    }
  };

  const handleDelete = async (workOrder) => {
    try {
      await WorkOrder.delete(workOrder.id);
      loadWorkOrders();
    } catch (error) {
      console.error("Error deleting work order:", error);
    }
  };

  const toggleFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullScreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullScreen(false);
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="w-full max-w-[95vw] mx-auto">
        <div className="px-1 flex justify-between items-center">
          <div>
            <h1 className="text-gray-800 mb-2 text-base font-bold">Design</h1>
            <p className="text-gray-600 text-xs">Create and approve designs</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={toggleFullScreen} className="bg-primary text-gray-800 px-4 py-2 text-sm font-medium opacity-70 rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-primary/90 h-10 clay-button border-none"

              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}>

              {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
            <Button
              onClick={() => {
                setEditingWorkOrder(null);
                setRiderConfig(null);
                setIsFormOpen(true);
              }} className="bg-slate-700 text-lime-600 px-4 py-2 text-sm font-medium opacity-90 rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-primary/90 h-10 clay-button border-none"

              style={{ background: 'linear-gradient(135deg, #D4E9F7 0%, #E0D4F7 100%)' }}>

              <Plus className="w-5 h-5 mr-2" />
              New Work Order
            </Button>
          </div>
        </div>

        <div className="clay-card">
          {isLoading ?
          <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading...</p>
            </div> :

          <DragDropList
            workOrders={workOrders}
            onReorder={handleReorder}
            onEdit={handleEdit}
            onMove={handleMove}
            onSplit={handleSplit}
            onComplete={handleComplete}
            onUpdate={loadWorkOrders}
            onDelete={handleDelete} />

          }
        </div>
      </div>

      <WorkOrderForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingWorkOrder(null);
          setRiderConfig(null);
        }}
        onSave={handleSave}
        workOrder={editingWorkOrder}
        isRider={!!riderConfig}
        parentWorkOrder={riderConfig?.parentWorkOrder}
        lockedStage={riderConfig?.stage} />

    </div>);

}