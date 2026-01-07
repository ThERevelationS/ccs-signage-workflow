import React, { useState, useEffect } from "react";
import { WorkOrder } from "@/entities/WorkOrder";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2 } from "lucide-react";
import DragDropList from "../components/workflow/DragDropList";
import WorkOrderForm from "../components/workflow/WorkOrderForm";
import { ActivityActions } from "../components/workflow/ActivityLogger";
import { useAuth } from "@/components/auth/EmailGate";

export default function CompletedJobs() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { isRegistered, promptForEmail } = useAuth();

  useEffect(() => {
    loadWorkOrders(true);
    const interval = setInterval(() => loadWorkOrders(false), 10000);
    
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Task descriptions that map to Completed Jobs page
  const COMPLETED_TASK_DESCRIPTIONS = [
    "Completed Sale - Electrical Inspection",
    "Completed Sale - Sign Inspection",
    "Completed Sales - Post Invoice Tasks",
    "Completed Sale"
  ];

  const loadWorkOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      // Get actually completed jobs OR jobs with completed task descriptions
      const allWorkOrders = await WorkOrder.filter({ deleted: { $ne: true } }, "-updated_date");
      const filtered = allWorkOrders.filter(wo => 
        wo.completed === true || 
        (wo.current_task_description && COMPLETED_TASK_DESCRIPTIONS.some(desc => 
          wo.current_task_description.includes(desc)
        ))
      );
      setWorkOrders(filtered);
    } catch (error) {
      console.error("Error loading completed work orders:", error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const handleReorder = async (reorderedItems) => {
    // This function typically updates the order in the backend as well.
    // For this change, we'll just update the local state as per the original.
    // If backend reordering is needed, it should also have try...catch.
    setWorkOrders(reorderedItems);
  };

  const handleEdit = (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    setEditingWorkOrder(workOrder);
    setIsFormOpen(true);
  };

  const handleSave = async (formData) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      if (editingWorkOrder) {
        await WorkOrder.update(editingWorkOrder.id, formData);
      }
      setEditingWorkOrder(null);
      setIsFormOpen(false);
      loadWorkOrders();
    } catch (error) {
      console.error("Error saving work order:", error);
    }
  };

  const handleRestore = async (workOrder, newStage) => {
    if (!isRegistered) { promptForEmail(); return; }
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
        completed: false, 
        current_stage: newStage,
        notes: notes
      });
      await ActivityActions.restored(workOrder, newStage);
      loadWorkOrders();
    } catch (error) {
      console.error("Error restoring work order:", error);
    }
  };

  const handleDelete = async (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      await ActivityActions.workOrderDeleted(workOrder);
      await WorkOrder.delete(workOrder.id);
      loadWorkOrders();
    } catch (error) {
      console.error("Error deleting work order:", error);
    }
  };

  const toggleFullScreen = async () => {
    try {
      if (!document.fullscreenElement) { // Check if document is not in fullscreen mode
        await document.documentElement.requestFullscreen();
        setIsFullScreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullScreen(false);
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
      // Optionally, display an error message to the user if fullscreen failed
    }
  };

  const handleDoubleClick = (e) => {
    if (isFullScreen && e.target.closest('.clay-card') === null) {
      document.exitFullscreen();
    }
  };

  return (
    <div className="min-h-screen p-4" onDoubleClick={handleDoubleClick}>
      {isFullScreen && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm z-50 pointer-events-none">
          To exit press ESC
        </div>
      )}
      <div className="w-full max-w-[95vw] mx-auto">
        {!isFullScreen && (
          <div className="flex justify-end items-center gap-2 mb-2">
            <div className="flex gap-2">
              <Button
                onClick={toggleFullScreen}
                size="sm"
                className="clay-button border-none text-gray-800 h-8 px-3"
                style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        <div className="clay-card p-6">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading...</p>
            </div>
          ) : (
            <DragDropList
              workOrders={workOrders}
              onReorder={handleReorder}
              onEdit={handleEdit}
              onRestore={handleRestore}
              onUpdate={loadWorkOrders}
              onDelete={handleDelete}
              showMoveOptions={false}
            />
          )}
        </div>
      </div>

      <WorkOrderForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingWorkOrder(null);
        }}
        onSave={handleSave}
        workOrder={editingWorkOrder}
      />
    </div>
  );
}