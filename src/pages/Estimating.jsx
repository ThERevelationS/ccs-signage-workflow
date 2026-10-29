import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { Input } from "@/components/ui/input";
import DragDropList from "@/components/workflow/DragDropList";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import { ActivityActions } from "@/components/workflow/ActivityLogger";
import { useAllWorkOrders, fetchAllWorkOrders } from "@/lib/workOrderCache";
import { createWorkOrderWithRecovery, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot, updateWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { reorderWorkOrdersFromLoadedSnapshot } from "@/components/workflow/workOrderPriorityPersistence";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { staffEntities } from "@/components/staff/staffEntities";

const WorkOrder = staffEntities.WorkOrder;

export default function Estimating() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(window.location.search).get("q") || ""
  );

  // Write-back: keep ?q= in the URL in sync so searches survive reload/share.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = searchQuery.trim();
    if (next) params.set("q", next); else params.delete("q");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [searchQuery]);
  const listContainerRef = useRef(null);
  const [cardContainers, setCardContainers] = useState({});
  const deepLinkedWorkOrderRef = useRef(false);

  useEffect(() => {
    document.title = "Estimating - Workflow Manager";
  }, []);

  const { data: cachedWorkOrders = [], isFetched: workOrdersFetched } = useAllWorkOrders();

  useEffect(() => {
    const taskDescriptions = getEstimatingTaskDescriptions();
    setWorkOrders((cachedWorkOrders || [])
      .filter(wo =>
        wo.is_rider !== true && wo.completed !== true && wo.deleted !== true &&
        wo.current_task_description && taskDescriptions.some(desc =>
          wo.current_task_description.includes(desc)
        )
      )
      .sort((a, b) => (a.priority || 0) - (b.priority || 0)));
  }, [cachedWorkOrders]);

  useEffect(() => {
    if (workOrdersFetched) setIsLoading(false);
  }, [workOrdersFetched]);

  useEffect(() => {
    loadWorkOrders();
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

  // Client-side queue filter seeded from the ?q= URL param.
  const filteredWorkOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return workOrders;
    return workOrders.filter((wo) =>
      (wo.title || "").toLowerCase().includes(query) ||
      (wo.client_name || "").toLowerCase().includes(query)
    );
  }, [workOrders, searchQuery]);

  const isFiltering = searchQuery.trim() !== "";

  const queueStats = useMemo(() => {
    let total = 0;
    let hasAmounts = false;
    for (const wo of filteredWorkOrders) {
      const amount = Number(wo.estimate_amount);
      if (wo.estimate_amount != null && wo.estimate_amount !== "" && Number.isFinite(amount)) {
        hasAmounts = true;
        total += amount;
      }
    }
    return { count: filteredWorkOrders.length, total, hasAmounts };
  }, [filteredWorkOrders]);

  // Locate each rendered card so the days-in-queue chip can be portaled onto it.
  useEffect(() => {
    const root = listContainerRef.current;
    const containers = {};
    if (root) {
      root.querySelectorAll("[data-rfd-draggable-id]").forEach((el) => {
        containers[el.getAttribute("data-rfd-draggable-id")] = el.querySelector(".clay-card") || el;
      });
    }
    setCardContainers(containers);
  }, [filteredWorkOrders, isLoading]);

  // Deep link: /Estimating?wo=<id> opens that work order once it has loaded.
  useEffect(() => {
    if (deepLinkedWorkOrderRef.current || workOrders.length === 0) return;
    const woId = new URLSearchParams(window.location.search).get("wo");
    if (!woId) return;
    const found = workOrders.find((wo) => wo.id === woId);
    if (!found) return;
    deepLinkedWorkOrderRef.current = true;
    if (isRegistered) {
      handleEdit(found);
    } else {
      const cardEl = listContainerRef.current?.querySelector(`[data-rfd-draggable-id="${woId}"]`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
        cardEl.classList.add("ring-4", "ring-blue-400", "rounded-2xl");
        setTimeout(() => cardEl.classList.remove("ring-4", "ring-blue-400", "rounded-2xl"), 4000);
      }
    }
  }, [workOrders, isRegistered]);

  const getDaysInQueue = (workOrder) => {
    const startedAt = workOrder?.created_date ? new Date(workOrder.created_date).getTime() : NaN;
    if (!Number.isFinite(startedAt)) return null;
    return Math.max(0, Math.floor((Date.now() - startedAt) / 86400000));
  };

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
    const orders = await fetchAllWorkOrders();
    const taskDescriptions = getEstimatingTaskDescriptions();
    // Filter to only show jobs with task descriptions assigned to Estimating page.
    return orders
      .filter(wo =>
        wo.is_rider !== true && wo.completed !== true && wo.deleted !== true &&
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
      NotificationTriggers.workOrderPriorityReordered(loadedItems, reorderedItems, currentUser?.full_name || currentUser?.email)
        .catch((e) => console.error("Priority-change notification failed:", e));
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
      className="h-full p-6 page-gradient-bg"
      onDoubleClick={handleDoubleClick}
    >
      {isFullscreen && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
          Double-click outside cards to exit fullscreen
        </div>
      )}

      {!isFullscreen && (
        <div className="max-w-7xl mx-auto mb-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Estimating</h1>
            <p className="text-sm text-gray-500">Manage estimation requests and quotes</p>
            <p className="text-xs text-gray-400 mt-1">
              {queueStats.count} {queueStats.count === 1 ? "job" : "jobs"}
              {queueStats.hasAmounts &&
                ` Â· $${queueStats.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </p>
          </div>
          <div className="relative w-64 max-w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title or client..."
              className="pl-8 bg-white/80"
            />
          </div>
        </div>
      )}

      {!isFullscreen && <StageTasksPanel stage="estimating" />}
      <div ref={listContainerRef} className={isFullscreen ? "h-full" : "max-w-7xl mx-auto"}>
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : isFiltering && filteredWorkOrders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No work orders match "{searchQuery.trim()}"</p>
          </div>
        ) : (
          <DragDropList
            workOrders={filteredWorkOrders}
            onReorder={handleReorder}
            reorderDisabled={isReordering || isFiltering}
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

      {/* Subtle days-in-queue chip portaled onto the bottom of each rendered card */}
      {filteredWorkOrders.map((wo) => {
        const container = cardContainers[wo.id];
        const daysInQueue = getDaysInQueue(wo);
        if (!container || daysInQueue == null) return null;
        return createPortal(
          <div className="flex justify-end px-4 pb-2 -mt-1 pointer-events-none">
            <span
              className="text-[10px] font-medium text-gray-400"
              title="Days in estimating queue"
            >
              {daysInQueue}d in queue
            </span>
          </div>,
          container,
          wo.id
        );
      })}

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