import { useState, useEffect } from "react";
import { WorkOrder } from "@/entities/WorkOrder";
import DragDropList from "../components/workflow/DragDropList";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import WorkOrderForm from "../components/workflow/WorkOrderForm";
import { ActivityActions } from "../components/workflow/ActivityLogger";
import { useAuth } from "@/components/auth/EmailGate";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { transitionWorkOrderFromLoadedSnapshot, updateWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";

export default function Design() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isRegistered, promptForEmail } = useAuth();

  useEffect(() => {
    document.title = "Design - Workflow Manager";
  }, []);

  useEffect(() => {
    loadWorkOrders(true);
    const interval = setInterval(() => loadWorkOrders(false), 60000);
    
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

  // Get task descriptions mapped to Design page from localStorage
  const getDesignTaskDescriptions = () => {
    try {
      const saved = localStorage.getItem('salesTaskDescriptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed
          .filter(item => item.page === "Design")
          .map(item => item.text || item);
      }
    } catch (e) {}
    return ["WIP - In Final Design Queue", "WIP - Designing"];
  };

  const loadWorkOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const allWorkOrders = await loadAllEntityRows({
        entity: WorkOrder,
        query: { completed: false, deleted: { $ne: true } },
        sort: "priority",
        label: "Design Work Orders",
      });
      const taskDescriptions = getDesignTaskDescriptions();
      // Filter to only show jobs with task descriptions assigned to Design page, or riders locked to design
      const filtered = allWorkOrders.filter(wo => 
        (wo.current_task_description && taskDescriptions.some(desc => 
          wo.current_task_description.includes(desc)
        )) || (wo.is_rider && wo.rider_stage === 'design' && wo.in_pipeline !== false)
      );
      setWorkOrders(filtered);
    } catch (error) {
      console.error("Error loading:", error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const handleReorder = async (reorderedItems) => {
    if (!isRegistered) { promptForEmail(); return; }
    setWorkOrders(reorderedItems);
    try {
      for (let i = 0; i < reorderedItems.length; i++) {
        await WorkOrder.update(reorderedItems[i].id, { priority: i });
      }
    } catch (error) {
      console.error("Error reordering:", error);
      loadWorkOrders();
    }
  };

  const handleSave = async (formData) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      if (editingWorkOrder) {
        await updateWorkOrderFromLoadedSnapshot({ workOrder: editingWorkOrder, formData, label: "Design Work Order" });
      } else {
        const maxPriority = workOrders.length > 0 ?
        Math.max(...workOrders.map((wo) => wo.priority || 0)) :
        -1;
        const created = await WorkOrder.create({ ...formData, priority: maxPriority + 1 });
        if (riderConfig) {
          await ActivityActions.riderCreated(created, riderConfig.parentWorkOrder.title);
        } else {
          await ActivityActions.workOrderCreated(created);
        }
      }
      setEditingWorkOrder(null);
      setRiderConfig(null);
      setIsFormOpen(false);
      loadWorkOrders();
    } catch (error) {
      console.error("Error saving:", error);
      throw error;
    }
  };

  const handleMove = async (workOrder, newStage) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      const oldStage = workOrder.current_stage;
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder,
        newStage,
        normalizeLegacyNotes: true,
        label: "Design stage transition",
      });
      await ActivityActions.stageChanged(workOrder, oldStage, newStage);
      loadWorkOrders();
    } catch (error) {
      console.error("Error moving:", error);
      loadWorkOrders();
    }
  };

  const handleEdit = (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    setEditingWorkOrder(workOrder);
    setRiderConfig(null);
    setIsFormOpen(true);
  };

  const handleSplit = (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    setRiderConfig({ parentWorkOrder: workOrder, stage: 'design' });
    setEditingWorkOrder(null);
    setIsFormOpen(true);
  };

  const handleComplete = async (workOrder) => {
    if (!isRegistered) { promptForEmail(); return; }
    try {
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder,
        newStage: "completed",
        completed: true,
        normalizeLegacyNotes: true,
        label: "Design completion",
      });
      await ActivityActions.workOrderCompleted(workOrder);
      loadWorkOrders();
    } catch (error) {
      console.error("Error completing work order:", error);
      loadWorkOrders();
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
        <StageTasksPanel stage="design" />

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