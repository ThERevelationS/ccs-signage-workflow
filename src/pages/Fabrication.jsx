import { useState, useEffect } from "react";
import { WorkOrder } from "@/entities/WorkOrder";
import { Button } from "@/components/ui/button";
import { Plus, Maximize2, Minimize2 } from "lucide-react";
import DragDropList from "../components/workflow/DragDropList";
import WorkOrderForm from "../components/workflow/WorkOrderForm";

export default function Fabrication() {
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
      // Changed sort order from "-priority" to "priority" to align with reordering logic
      const allWorkOrders = await WorkOrder.filter({ completed: false }, "priority");
      const filtered = allWorkOrders.filter(
        wo => wo.current_stage === 'fabrication' || (wo.is_rider && wo.rider_stage === 'fabrication')
      );
      setWorkOrders(filtered);
    } catch (error) {
      console.error("Error loading work orders:", error);
      // Optionally, handle error state for the user
    } finally {
      setIsLoading(false);
    }
  };

  const handleReorder = async (reorderedItems) => {
    // Optimistic update
    setWorkOrders(reorderedItems);
    try {
      // Update priorities in the database
      for (let i = 0; i < reorderedItems.length; i++) {
        await WorkOrder.update(reorderedItems[i].id, { priority: i });
      }
    } catch (error) {
      console.error("Error reordering work orders:", error);
      // Revert to previous state or reload to ensure data consistency
      loadWorkOrders();
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editingWorkOrder) {
        await WorkOrder.update(editingWorkOrder.id, formData);
      } else {
        const maxPriority = workOrders.length > 0
          ? Math.max(...workOrders.map(wo => wo.priority || 0))
          : -1;
        await WorkOrder.create({ ...formData, priority: maxPriority + 1 });
      }
      setEditingWorkOrder(null);
      setRiderConfig(null);
      setIsFormOpen(false); // Close form on successful save
      loadWorkOrders(); // Reload work orders to update list
    } catch (error) {
      console.error("Error saving work order:", error);
      // Optionally, show a user-friendly error message
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
      console.error("Error moving work order:", error);
      // Optionally, show a user-friendly error message
    }
  };

  const handleEdit = (workOrder) => {
    setEditingWorkOrder(workOrder);
    setRiderConfig(null);
    setIsFormOpen(true);
  };

  const handleSplit = (workOrder) => {
    setRiderConfig({ parentWorkOrder: workOrder, stage: 'fabrication' });
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
      console.error("Fullscreen API error:", error);
      // Handle cases where fullscreen might be denied or unsupported
    }
  };

  return (
    <div className="min-h-screen p-6">
      <div className="w-full max-w-[95vw] mx-auto">
        <div className="px-1 flex justify-between items-center">
          <div>
            <h1 className="text-gray-800 mb-2 text-base font-bold">Fabrication</h1>
            <p className="text-gray-600 text-xs">Build and assemble signs</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={toggleFullScreen}
              className="clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </Button>
            <Button
              onClick={() => {
                setEditingWorkOrder(null);
                setRiderConfig(null);
                setIsFormOpen(true);
              }}
              className="clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #FFD6E8 0%, #E0D4F7 100%)' }}
            >
              <Plus className="w-5 h-5 mr-2" />
              New Work Order
            </Button>
          </div>
        </div>

        <div className="clay-card">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading...</p>
            </div>
          ) : (
            <DragDropList
              workOrders={workOrders}
              onReorder={handleReorder}
              onEdit={handleEdit}
              onMove={handleMove}
              onSplit={handleSplit}
              onComplete={handleComplete}
              onUpdate={loadWorkOrders}
              onDelete={handleDelete}
            />
          )}
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
        lockedStage={riderConfig?.stage}
      />
    </div>
  );
}