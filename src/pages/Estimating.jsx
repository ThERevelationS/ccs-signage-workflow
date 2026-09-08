import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import DragDropList from "@/components/workflow/DragDropList";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityActions } from "@/components/workflow/ActivityLogger";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const WorkOrder = base44.entities.WorkOrder;

export default function Estimating() {
  const { isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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
    } catch (e) {}
    return ["Complete Estimate for Review", "Estimate - To Be Reviewed"];
  };

  const loadWorkOrders = async () => {
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
    // Filter to only show jobs with task descriptions assigned to Estimating page
    const filtered = orders.filter(wo => 
      wo.current_task_description && taskDescriptions.some(desc => 
        wo.current_task_description.includes(desc)
      )
    );
    setWorkOrders(filtered.sort((a, b) => (a.priority || 0) - (b.priority || 0)));
    setIsLoading(false);
  };

  const handleReorder = (reordered) => {
    setWorkOrders(reordered);
  };

  const handleSave = async (workOrderData) => {
    if (!isRegistered) return;

    if (editingWorkOrder) {
      await WorkOrder.update(editingWorkOrder.id, workOrderData);
      await ActivityActions.logWorkOrderUpdate(editingWorkOrder, workOrderData);
    } else if (riderConfig) {
      const riderData = {
        ...workOrderData,
        is_rider: true,
        parent_work_order_id: riderConfig.parentId,
        rider_stage: riderConfig.stage,
        current_stage: riderConfig.stage,
        priority: 0
      };
      const newRider = await WorkOrder.create(riderData);
      await ActivityActions.logRiderCreated(newRider, riderConfig.parentId);
      setRiderConfig(null);
    } else {
      const newOrder = await WorkOrder.create({
        ...workOrderData,
        current_stage: "estimating",
        priority: workOrders.length
      });
      await ActivityActions.logWorkOrderCreated(newOrder);
    }
    
    setShowForm(false);
    setEditingWorkOrder(null);
    loadWorkOrders();
  };

  const handleMove = async (workOrder, toStage) => {
    if (!isRegistered) return;
    const fromStage = workOrder.current_stage;
    await WorkOrder.update(workOrder.id, { current_stage: toStage });
    await ActivityActions.logStageChange(workOrder, fromStage, toStage);
    loadWorkOrders();
  };

  const handleEdit = (workOrder) => {
    if (!isRegistered) return;
    setEditingWorkOrder(workOrder);
    setShowForm(true);
  };

  const handleSplit = (workOrder, stage) => {
    if (!isRegistered) return;
    setRiderConfig({ parentId: workOrder.id, stage });
    setShowForm(true);
  };

  const handleComplete = async (workOrder) => {
    if (!isRegistered) return;
    await WorkOrder.update(workOrder.id, { completed: true });
    await ActivityActions.logWorkOrderCompleted(workOrder);
    loadWorkOrders();
  };

  const handleDelete = async (workOrder) => {
    if (!isRegistered) return;
    await WorkOrder.update(workOrder.id, { 
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: (await base44.auth.me())?.email || "unknown"
    });
    await ActivityActions.logWorkOrderDeleted(workOrder);
    loadWorkOrders();
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
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