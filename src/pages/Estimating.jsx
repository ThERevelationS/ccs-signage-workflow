import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import QueueFilterBar from "@/components/queues/QueueFilterBar";
import {
  DEFAULT_QUEUE_FILTERS,
  flattenQueueRows,
  filterQueueRows,
  serializeQueueFilters,
} from "@/components/queues/productQueueModel";
import { OPERATIONAL_STATUS_CUSTOMER_LABELS } from "@/components/estimator/workOrderConversion";
import DragDropList from "@/components/workflow/DragDropList";
import StageTasksPanel from "@/components/workflow/StageTasksPanel";
import WorkOrderForm from "@/components/workflow/WorkOrderForm";
import { ActivityActions } from "@/components/workflow/ActivityLogger";
import { useAllWorkOrders, fetchAllWorkOrders } from "@/lib/workOrderCache";
import { createWorkOrderWithRecovery, softDeleteWorkOrderFromLoadedSnapshot, transitionWorkOrderFromLoadedSnapshot, updateWorkOrderFromLoadedSnapshot } from "@/components/workflow/workOrderPersistence";
import { reorderWorkOrdersFromLoadedSnapshot } from "@/components/workflow/workOrderPriorityPersistence";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import { staffEntities } from "@/components/staff/staffEntities";
import { useEstimateDeepLink } from "@/components/estimator/deepLinks";

const WorkOrder = staffEntities.WorkOrder;

// C-01 — shared CoreBridge queue filter bar on this board. The bar is
// stateless; the page owns the filter object and pushes it through the
// product-queue model. flattenQueueRows only emits product rows, so each
// work order also contributes one order-level "meta" row carrying the
// order fields the bar can still match (ref/company search blob, WO
// designer/assignee, sales rep, entered-by, install-date due). Product-only
// fields stay blank on meta rows so select filters remain product-accurate.
// Work orders carry no line_items — the honest "notes-level" search set is
// the description/notes/estimate-number columns the entity actually has.
const WO_META_SEARCH_FIELDS = [
  "title", "client_name", "contact_name", "corbridge_invoice_number",
  "work_order_number", "source_estimate_number", "customer_description",
  "description", "estimator_notes", "work_notes", "current_task_description",
];

function woMetaQueueRow(wo) {
  return {
    workOrderId: wo.id,
    ref: wo.corbridge_invoice_number || wo.title || wo.id,
    company: wo.client_name || "",
    productName: WO_META_SEARCH_FIELDS.map((f) => wo?.[f]).filter((v) => String(v || "").trim()).join(" "),
    status: "none",
    substatus: "",
    designer: wo.designer || "",
    assignedTo: wo.assigned_to || "",
    responsibility: "",
    category: "",
    moduleKey: "",
    due: "",
    woDue: wo.project_install_date || "",
    hardDue: false,
    machine: "",
    part: "",
    salesperson: wo.sales_rep || wo.salesperson || wo.salesperson_email || "",
    enteredBy: wo.created_by || wo.entered_by || "",
    rush: wo.is_rush === true || wo.rush === true ||
      String(wo.order_priority || "").trim().toLowerCase() === "rush",
  };
}

// Options are {value,label} lists of the distinct values present in the
// queue rows — the QueueFilterBar contract.
function queueOptionsFromRows(rows) {
  const uniq = (key) =>
    [...new Set((rows || []).map((r) => r[key]).filter((v) => String(v || "").trim()))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((v) => ({ value: v, label: v }));
  return {
    machines: uniq("machine"),
    partCategories: uniq("category"),
    parts: uniq("part"),
    designers: uniq("designer"),
    substatuses: uniq("substatus"),
    responsibilities: uniq("responsibility"),
    assignees: uniq("assignedTo"),
    salespeople: uniq("salesperson"),
    enteredBys: uniq("enteredBy"),
    moduleKeys: uniq("moduleKey"),
    statuses: [...new Set((rows || []).map((r) => r.status).filter((s) => s && s !== "none"))]
      .sort()
      .map((s) => ({ value: s, label: OPERATIONAL_STATUS_CUSTOMER_LABELS[s] || s })),
  };
}

// Non-default filters (beyond page size / include-fulfilled which do not
// change which orders show on a board) disable drag reorder — a filtered
// subset has no meaningful order to persist.
function queueFiltersActive(filters) {
  const ser = serializeQueueFilters({ ...filters, pageSize: DEFAULT_QUEUE_FILTERS.pageSize });
  delete ser.fulfilled;
  return Object.keys(ser).length > 0 ||
    ["machine", "part", "salesperson", "enteredBy"].some((k) => (filters?.[k] ?? "all") !== "all");
}

export default function Estimating() {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [riderConfig, setRiderConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  // C-01 — the shared queue filter bar owns the search box now; its `search`
  // key is seeded from ?q= so deep links keep working.
  const [queueFilters, setQueueFilters] = useState(() => ({
    ...DEFAULT_QUEUE_FILTERS,
    search: new URLSearchParams(window.location.search).get("q") || "",
  }));

  // Write-back: keep ?q= in the URL in sync so searches survive reload/share.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = queueFilters.search.trim();
    if (next) params.set("q", next); else params.delete("q");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [queueFilters.search]);
  const listContainerRef = useRef(null);
  const [cardContainers, setCardContainers] = useState({});
  const deepLinkedWorkOrderRef = useRef(false);
  // #302 — /Estimating?estimate=<id> forwards to the estimate detail.
  useEstimateDeepLink();

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

  // Queue-row universe for the filter bar: product rows (flatten honors
  // includeFulfilled) + one order-level meta row per work order. The meta
  // row's productName carries the notes-level search blob so the model's
  // free-search arm covers the same fields the old bespoke search did (#301).
  const queueRows = useMemo(() => {
    const rows = flattenQueueRows(workOrders, { includeFulfilled: queueFilters.includeFulfilled });
    for (const wo of workOrders) if (wo?.id) rows.push(woMetaQueueRow(wo));
    return rows;
  }, [workOrders, queueFilters.includeFulfilled]);

  const queueOptions = useMemo(() => queueOptionsFromRows(queueRows), [queueRows]);
  const filtersActive = useMemo(() => queueFiltersActive(queueFilters), [queueFilters]);

  // Client-side queue filter seeded from the ?q= URL param.
  const filteredWorkOrders = useMemo(() => {
    const ids = new Set(filterQueueRows(queueRows, queueFilters).map((r) => r.workOrderId));
    return workOrders.filter((wo) => ids.has(wo.id));
  }, [workOrders, queueRows, queueFilters]);

  const isFiltering = filtersActive || queueFilters.search.trim() !== "";

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
        deletedBy: currentUser?.email || "unknown",
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
        <>
          <div className="max-w-7xl mx-auto mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Estimating</h1>
              <p className="text-sm text-gray-500">Manage estimation requests and quotes</p>
              <p className="text-xs text-gray-400 mt-1">
                {queueStats.count} {queueStats.count === 1 ? "job" : "jobs"}
                {queueStats.hasAmounts &&
                  ` · $${queueStats.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </p>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mb-4">
            <QueueFilterBar
              filters={queueFilters}
              onChange={setQueueFilters}
              options={queueOptions}
              pageSize={queueFilters.pageSize}
              onPageSizeChange={(n) => setQueueFilters((f) => ({ ...f, pageSize: n }))}
            />
          </div>
        </>
      )}

      {!isFullscreen && <StageTasksPanel stage="estimating" />}
      <div ref={listContainerRef} className={isFullscreen ? "h-full" : "max-w-7xl mx-auto"}>
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : isFiltering && filteredWorkOrders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {queueFilters.search.trim()
                ? `No work orders match "${queueFilters.search.trim()}"`
                : "No work orders match these filters."}
            </p>
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