import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import DragDropList from "@/components/workflow/DragDropList";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import { ActivityActions } from "@/components/workflow/ActivityLogger";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { createWorkOrderWithRecovery, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot, updateWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { reorderWorkOrdersFromLoadedSnapshot } from "@/components/workflow/workOrderPriorityPersistence";

const WorkOrder = base44.entities.WorkOrder;

export default function Estimating() {
  const { isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    document.title = "Estimating - Workflow Manager";
  }, []);

  useEffect(() => {
    loadWorkOrders();
    const interval = setInterval(() => loadWorkOrders(), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Get task descriptions mapped to Estimating page from localStorage
  const getEstimatingTaskDescriptions = () => {
    try {
      const saved = localStorage.getItem('salesTaskDescriptions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed
          .filter(item => item.page === "Estimating")
          .map(item => item.text || item);
      }
    } catch {}
    return ["Complete Estimate for Review", "Estimate - To Be Reviewed"];
  };

  const fetchWorkOrders = async () => {
    const orders = await loadAllEntityRows({
      entity: WorkOrder,
      query: {
        is_rider: false,
        completed: false,
        deleted: { $ne: true }
      },
      sort: "created_date",
      label: "Estimating Work Orders",
    });
    const taskDescriptions = getEstimatingTaskDescriptions();
    // Filter to only show jobs with task descriptions assigned to Estimating page.
    return orders
      .filter(wo =>
        wo.current_task_description && taskDescriptions.some(desc =>
          wo.current_task_description.includes(desc)
        )
      )
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  };

  const loadWorkOrders = async () => {
    try {
      setWorkOrders(await fetchWorkOrders());
    } catch (error) {
      console.error("Error loading Estimating Work Orders:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReorder = async (reorderedItems) => {
    if (!isRegistered || isReordering) return;

    const loadedItems = workOrders;
    setWorkOrders(reorderedItems);
    setIsReordering(true);
    try {
      const result = await reorderWorkOrdersFromLoadedSnapshot({
        entity: WorkOrder,
        loadedItems,
        reorderedItems,
        readCurrentItems: fetchWorkOrders,
        label: "Estimating priority reorder",
      });
      setWorkOrders(result.items);
    } catch (error) {
      console.error("Error reordering Estimating Work Orders:", error);
      alert(error?.message || "The Estimating priority order changed in another session. Reload and try the reorder again.");
      await loadWorkOrders();
    } finally {
      setIsReordering(false);
    }
  };

  const handleSave = async (workOrderData) => {
    if (!isRegistered) return;

    if (editingWorkOrder) {
      const saved = await updateWorkOrderFromLoadedSnapshot({ workOrder: editingWorkOrder, formData: workOrderData, label: "Estimating Work Order" });
      const changedFields = Object.keys(workOrderData || {}).filter((field) =>
        JSON.stringify(editingWorkOrder?.[field] ?? null) !== JSON.stringify(saved?.[field] ?? null)
      );
      for (const field of changedFields) {
        await ActivityActions.fieldUpdated(saved, field, editingWorkOrder?.[field], saved?.[field]);
      }
    } else if (riderConfig) {
      const riderData = {
        ...workOrderData,
        is_rider: true,
        parent_work_order_id: riderConfig.parentId,
        rider_stage: riderConfig.stage,
        current_stage: riderConfig.stage,
        priority: 0
      };
      const { record: newRider } = await createWorkOrderWithRecovery({ data: riderData, label: "Estimating rider Work Order" });
      try {
        await ActivityActions.riderCreated(newRider, riderConfig.parentTitle || riderConfig.parentId);
      } catch (activityError) {
        console.error("Estimating rider was saved but activity logging failed:", activityError);
        alert("The rider was saved successfully, but its activity notification could not be completed. Do not create the rider again; reload to see the saved rider.");
      }
      setRiderConfig(null);
    } else {
      const { record: newOrder } = await createWorkOrderWithRecovery({
        data: {
          ...workOrderData,
          current_stage: "estimating",
          priority: workOrders.length
        },
        label: "Estimating Work Order",
      });
      try {
        await ActivityActions.workOrderCreated(newOrder);
      } catch (activityError) {
        console.error("Estimating Work Order was saved but activity logging failed:", activityError);
        alert("The Work Order was saved successfully, but its activity notification could not be completed. Do not create the Work Order again; reload to see the saved job.");
      }
    }
    
    setShowForm(false);
    setEditingWorkOrder(null);
    loadWorkOrders();
  };

  const handleMove = async (workOrder, toStage) => {
    if (!isRegistered) return;
    const fromStage = workOrder.current_stage;
    try {
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder,
        newStage: toStage,
        label: "Estimating stage transition",
      });
      await ActivityActions.stageChanged(workOrder, fromStage, toStage);
    } catch (error) {
      console.error("Error moving Estimating Work Order:", error);
      alert(error?.message || "This Work Order changed in another session. Reload and try the transition again.");
    }
    loadWorkOrders();
  };

  const handleEdit = (workOrder) => {
    if (!isRegistered) return;
    setEditingWorkOrder(workOrder);
    setShowForm(true);
  };

  const handleSplit = (workOrder, stage) => {
    if (!isRegistered) return;
    setRiderConfig({ parentId: workOrder.id, parentTitle: workOrder.title || workOrder.client_name || workOrder.id, stage });
    setShowForm(true);
  };

  const handleComplete = async (workOrder) => {
    if (!isRegistered) return;
    try {
      await transitionWorkOrderFromLoadedSnapshot({
        workOrder,
        newStage: workOrder.current_stage,
        completed: true,
        label: "Estimating completion",
      });
      await ActivityActions.workOrderCompleted(workOrder);
    } catch (error) {
      console.error("Error completing Estimating Work Order:", error);
      alert(error?.message || "This Work Order changed in another session. Reload and try completion again.");
    }
    loadWorkOrders();
  };

  const handleDelete = async (workOrder) => {
    if (!isRegistered) return;
    try {
      const deleted = await softDeleteWorkOrderFromLoadedSnapshot({
        workOrder,
        deletedBy: (await base44.auth.me())?.email || "unknown",
        label: "Estimating Work Order delete",
      });
      Object.assign(workOrder, deleted);
      await ActivityActions.workOrderDeleted(workOrder);
    } catch (error) {
      console.error("Error deleting Estimating Work Order:", error);
      alert(error?.message || "This Work Order changed in another session. Reload before deleting it.");
    }
    loadWorkOrders();
  };

  const handleDoubleClick = (e) => {
    if (isFullscreen && !e.target.closest('.work-order-card')) {
      document.exitFullscreen();
    }
  };

  return (
    <div 
      className="h-full p-6" 
      style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}
      onDoubleClick={handleDoubleClick}
    >
      {isFullscreen && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
          Double-click outside cards to exit fullscreen
        </div>
      )}

      {!isFullscreen && (
        <div className="max-w-7xl mx-auto mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Estimating</h1>
            <p className="text-sm text-gray-500">Manage estimation requests and quotes</p>
          </div>

        </div>
      )}

      {!isFullscreen && <StageTasksPanel stage="estimating" />}
      <div className={isFullscreen ? "h-full" : "max-w-7xl mx-auto"}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <DragDropList
            workOrders={workOrders}
            onReorder={handleReorder}
            reorderDisabled={isReordering}
            onMove={handleMove}
            onEdit={handleEdit}
            onSplit={handleSplit}
            onComplete={handleComplete}
            onDelete={handleDelete}
            onUpdate={loadWorkOrders}
            currentStage="estimating"
            isFullscreen={isFullscreen}
          />
        )}
      </div>

      {showForm && (
        <WorkOrderForm
          workOrder={editingWorkOrder}
          riderConfig={riderConfig}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingWorkOrder(null);
            setRiderConfig(null);
          }}
          currentStage="estimating"
        />
      )}
    </div>
  );
}